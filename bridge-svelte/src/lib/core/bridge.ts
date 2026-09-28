/**
 * Phase 4 (TBP-288/319) — unified read surface for bridge-svelte.
 *
 * Single object grouped by scope (`bridge.app` / `bridge.tenant` / `bridge.user`).
 * Each slice is a Svelte `Readable` populated from `session.snapshot` on
 * channel connect AND on every reconnect. Snapshot composition is fixed —
 * lazy slices (quotas, members, plans, settings, preferences) land in
 * follow-up sub-tickets (TBP-322 `.load()` semantics + TBP-323 reactive
 * binding for loaded slices).
 *
 * Backward compat: this is purely additive. The module-level stores
 * (`subscriptionStore`, `appConfigStore`, etc.) continue to exist and are
 * populated by the same internal state; both surfaces coexist.
 *
 * `useBridge()` (use-bridge.ts) returns this same object, or a component-scoped
 * override set with `setBridgeContext()`.
 */
import { derived, get, type Readable } from 'svelte/store';
import {
  appBrandingStore,
  tenantEntitlementsStore,
  tenantIdStore,
  tenantNameStore,
  tenantSubscriptionStore,
  userSnapshotStore,
  type BrandingSnapshot,
  type SubscriptionSnapshot,
  type UserSnapshot,
} from './snapshot-stores.js';
import { LazySlice } from './lazy-slice.js';
import { noteBrowserCount } from './double-count-warning.js';
import type { BridgeAuth, CurrentUser, Plan, SubscriptionStatus } from '@nebulr-group/bridge-auth-core';
import { DevAttributeProvider } from '@nebulr-group/bridge-auth-core';
import { getBridgeAuth, tokenStore, subscriptionStore, loadSubscription } from './bridge-instance.js';
import { bridgeEvents, type BridgeEventsDispatcher } from './events.js';

export interface BridgeAppSurface {
  /** Whitelabel branding (logo, colors, name). Populated by session.snapshot. */
  branding: Readable<BrandingSnapshot | null>;
  /**
   * Full plan catalog. Lazy — `await bridge.app.plans` or `bridge.app.plans.load()`
   * triggers the fetch on first access. Returns `null` until loaded.
   */
  plans: LazySlice<Plan[]>;
}

export interface BridgeTenantSurface {
  /** Workspace identifier. Populated by session.snapshot. */
  id: Readable<string | null>;
  /** Workspace display name. Populated by session.snapshot. */
  name: Readable<string | null>;
  /**
   * Canonical subscription (plan + status + endsAt). Live via `session.snapshot`
   * and every `subscription.plan_changed` push when the realtime channel is
   * active; otherwise transparently falls back to
   * the REST subscription endpoint (fetched lazily on first read).
   */
  subscription: Readable<SubscriptionSnapshot | null>;
  /**
   * Entitlements scope. `snapshot` is the full `{ key: boolean }` map;
   * `can(key)` is the imperative read for ergonomic checks. The map is
   * populated by `session.snapshot` and replaced wholesale on every
   * `entitlements.changed` push (Phase 2/US-12).
   */
  entitlements: {
    snapshot: Readable<Record<string, boolean> | null>;
    can(key: string): boolean;
  };
}

/**
 * TBP-697 — usage reporting from the browser.
 *
 * Count once, where the action happens. When the action stays in the browser
 * (a local-first or mobile app, data on the device) count it here — a
 * first-class setup that trusts the browser: Bridge shows and bills what the
 * page reports, and only a backend can refuse a write. When the click calls
 * your server, the backend handler counts it (bridge-nestjs `@RequireQuota`)
 * and the page reports nothing. In development the console warns once when a
 * metric is counted on both sides.
 *
 * Which call: *if deleting it frees room, it's a gauge and your app counts it
 * (`set`); if it happened, it's a counter and Bridge counts it (`report`).*
 */
export interface BridgeUsageSurface {
  /**
   * Count something that happened (a counter): `report('ai_completions')`,
   * `report('tokens', 1375)`. Fire-and-forget; queued durably and sent in
   * batches. Pass an `idempotencyKey` when the same event could be reported
   * twice (a retry), so Bridge counts it once.
   */
  report(metric: string, value?: number, idempotencyKey?: string): void;
  /**
   * Say how many of something exist right now (a gauge): `set('projects', 8)`
   * after the app creates or deletes one. Absolute, never added up; resolves
   * once Bridge has stored it. Needs `@nebulr-group/bridge-auth-core`
   * 0.8.0-beta.0 or later.
   */
  set(metric: string, value: number): Promise<void>;
  /** Queue depth, retries and the last flush — for a debug panel. */
  getQueueStatus(): Promise<UsageQueueStatus>;
}

/** What `bridge.usage.getQueueStatus()` resolves to. */
export type UsageQueueStatus = Awaited<ReturnType<BridgeAuth['usage']['getQueueStatus']>>;

export interface BridgeSurface {
  app: BridgeAppSurface;
  tenant: BridgeTenantSurface;
  /**
   * Authenticated user (id/email/role/tenantId). Live via `session.snapshot`
   * when the realtime channel is active; otherwise transparently seeded from the
   * access-token claims (the only client-side source of `role`).
   */
  user: Readable<UserSnapshot | null>;
  /**
   * Phase 5 (TBP-328) — single attribute write surface. `set/bind/bindMany`
   * publish dev-supplied attributes into the flag eval context. `get()`
   * returns the current merged map. `.subscribe()` works as a Svelte store.
   */
  attributes: DevAttributeProvider;
  /**
   * Phase 5 (TBP-331) — single events dispatcher. `bridge.events.handle({...})`
   * is the canonical way to subscribe to channel events; replaces per-domain
   * handlers (`useBridge().handle({...})`, `realtime.setOnXyz()`, etc.).
   */
  events: BridgeEventsDispatcher;
  /**
   * TBP-697 — report usage from the browser: `bridge.usage.report(metric)` for
   * a counter, `bridge.usage.set(metric, value)` for a gauge. Self-reported —
   * see {@link BridgeUsageSurface}.
   */
  usage: BridgeUsageSurface;
}

let _lastEntitlements: Record<string, boolean> | null = null;
// Keep `_lastEntitlements` in sync so `can()` can answer synchronously.
// The store subscription is module-scoped and starts once on import; vitest's
// store reset (`__resetSnapshotStores`) flips it back to null cleanly.
tenantEntitlementsStore.subscribe((m) => {
  _lastEntitlements = m;
});

function entitlementsCan(key: string): boolean {
  return !!_lastEntitlements?.[key];
}

/**
 * The singleton bridge surface. Available immediately on import — the slice
 * stores are `null` until the realtime client receives a `session.snapshot`,
 * at which point every slice updates atomically (one server message → many
 * store writes via `applySessionSnapshot`).
 *
 * Identity is stable: the object reference never changes. Consumers can
 * destructure or store sub-references freely.
 */
// Lazy slice loaders — deferred to first .load() / await. Wrapped in arrow
// functions so getBridgeAuth() resolution happens at load time, not at module
// import (otherwise SSR import of the bridge surface throws because
// initBridge() hasn't been called yet).
const _plansSlice = new LazySlice<Plan[]>({
  load: async () => getBridgeAuth().getPlans(),
});

// Phase 5 (TBP-328) — singleton dev-attribute provider. createBridgeFlags
// registers this instance with the AttributeProviderRegistry at bootstrap
// (LAST in registration order so dev keys win on collision — locked
// decision #20: providers < setContext < per-call, and dev's provider is
// effectively the per-call equivalent for set/bind/bindMany).
const _devAttributes = new DevAttributeProvider();

// ── Layered sources behind `bridge.user` / `bridge.tenant.subscription` ──────
//
// Design contract (locked): the developer always reads the SAME store; whether
// the value comes from the live realtime channel or a static fallback is
// invisible to them.
//   A. Default — the `session.snapshot` channel populates and live-updates the
//      snapshot stores; they win whenever present.
//   B. Fallback (channel not active) — `bridge.user` is seeded from the access
//      token claims (instant, full-fidelity for role); `bridge.tenant.subscription`
//      falls back to the REST subscription endpoint (full plan name/status,
//      fetched lazily). These are NOT live-updated — by design, since the app
//      opted out of the live channel.

/**
 * JWT-derived user, recomputed whenever the token set changes (login, refresh,
 * workspace switch, logout). Reuses auth-core's `getCurrentUser()` — the single
 * home for access-token claim parsing. `null` when unauthenticated.
 */
const _jwtUser: Readable<UserSnapshot | null> = derived(tokenStore, ($t) => {
  if (!$t?.accessToken) return null;
  let claims: CurrentUser | null = null;
  try {
    claims = getBridgeAuth().getCurrentUser();
  } catch {
    return null;
  }
  if (!claims) return null;
  return {
    id: claims.id,
    email: claims.email,
    // UserSnapshot requires these; the live snapshot supplies the authoritative
    // values, the JWT fallback fills them when claims carry them.
    role: claims.role ?? '',
    tenantId: claims.tenantId ?? '',
  };
});

/** `bridge.user`: live snapshot wins; JWT seed is the static fallback. */
const _userSurface: Readable<UserSnapshot | null> = derived(
  [userSnapshotStore, _jwtUser],
  ([snap, jwt]) => snap ?? jwt,
);

/** Map the REST `SubscriptionStatus` to the canonical `SubscriptionSnapshot` shape. */
function mapRestSubscription(status: SubscriptionStatus | null): SubscriptionSnapshot | null {
  if (!status) return null;
  const plan = status.plan;
  let slug = '';
  let name = '';
  if (typeof plan === 'string') {
    slug = plan;
    name = plan;
  } else if (plan) {
    slug = plan.key;
    name = plan.name;
  }
  // REST exposes lifecycle as booleans; derive a best-effort status string to
  // parallel the snapshot's `status` field.
  const statusStr = status.paymentFailed
    ? 'past_due'
    : status.trial
      ? 'trialing'
      : status.paymentsEnabled || status.plan
        ? 'active'
        : 'incomplete';
  return { plan: { slug, name }, status: statusStr };
}

/**
 * `bridge.tenant.subscription`: live snapshot wins; otherwise the REST endpoint
 * is fetched lazily on first subscribe (only when no snapshot and not already
 * loading/loaded). In live apps the snapshot is present, so REST is never hit.
 */
const _subscriptionMerged: Readable<SubscriptionSnapshot | null> = derived(
  [tenantSubscriptionStore, subscriptionStore],
  ([snap, rest]) => snap ?? mapRestSubscription(rest.status),
);

const _subscriptionSurface: Readable<SubscriptionSnapshot | null> = {
  subscribe(run, invalidate) {
    const noSnapshot = get(tenantSubscriptionStore) == null;
    const rest = get(subscriptionStore);
    if (noSnapshot && rest.status == null && !rest.loading) {
      // Lazy fallback fetch — throws if unauthenticated; swallow (stays null).
      loadSubscription().catch(() => {});
    }
    return _subscriptionMerged.subscribe(run, invalidate);
  },
};

// TBP-697 — `bridge.usage`. Resolved on each call, not at import: the
// BridgeAuth instance does not exist until bootstrap, and SSR imports this module.
const _usage: BridgeUsageSurface = {
  report(metric, value, idempotencyKey) {
    noteBrowserCount(metric); // TBP-697 — dev warning when the backend counts it too
    getBridgeAuth().usage.report(metric, value, idempotencyKey);
  },
  async set(metric, value) {
    noteBrowserCount(metric);
    const usage = getBridgeAuth().usage as Partial<BridgeAuth['usage']>;
    // Peer range still admits auth-core 0.7.x, which has no gauges. Say so
    // instead of "set is not a function".
    if (typeof usage.set !== 'function') {
      throw new Error(
        'bridge.usage.set() needs @nebulr-group/bridge-auth-core 0.8.0-beta.0 or later (gauge quotas). ' +
          'Upgrade it, or report a counter with bridge.usage.report().',
      );
    }
    await usage.set(metric, value);
  },
  getQueueStatus() {
    return getBridgeAuth().usage.getQueueStatus();
  },
};

export const bridge: BridgeSurface = {
  app: {
    branding: appBrandingStore,
    plans: _plansSlice,
  },
  tenant: {
    id: tenantIdStore,
    name: tenantNameStore,
    subscription: _subscriptionSurface,
    entitlements: {
      snapshot: tenantEntitlementsStore,
      can: entitlementsCan,
    },
  },
  user: _userSurface,
  attributes: _devAttributes,
  events: bridgeEvents,
  usage: _usage,
};

/** Internal: createBridgeFlags imports this to register the dev provider. */
export function _getDevAttributeProvider(): DevAttributeProvider {
  return _devAttributes;
}

/**
 * Test-only: reset every lazy slice on the bridge to its unloaded state.
 * Vitest hook for inter-test isolation. Mirrors `__resetSnapshotStores` from
 * snapshot-stores.ts.
 * @internal
 */
export function __resetBridgeLazySlices(): void {
  _plansSlice._resetForTests();
}

/**
 * Test-only: derived helper that observers can use to assert all slices
 * landed at once on a snapshot event. Not part of the public surface.
 * @internal
 */
export const _allSnapshotSlices: Readable<{
  branding: BrandingSnapshot | null;
  tenantId: string | null;
  tenantName: string | null;
  subscription: SubscriptionSnapshot | null;
  entitlements: Record<string, boolean> | null;
  user: UserSnapshot | null;
}> = derived(
  [
    appBrandingStore,
    tenantIdStore,
    tenantNameStore,
    tenantSubscriptionStore,
    tenantEntitlementsStore,
    userSnapshotStore,
  ],
  ([branding, tenantId, tenantName, subscription, entitlements, user]) => ({
    branding,
    tenantId,
    tenantName,
    subscription,
    entitlements,
    user,
  }),
);
