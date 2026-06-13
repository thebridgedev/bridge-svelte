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
 * Note: `useBridge()` (Svelte context hook) lands in TBP-320. This module
 * only exposes the singleton aggregate `bridge`; consumers can import it
 * directly until the context hook ships.
 */
import { derived, type Readable } from 'svelte/store';
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
import type { Plan } from '@nebulr-group/bridge-auth-core';
import { DevAttributeProvider } from '@nebulr-group/bridge-auth-core';
import { getBridgeAuth } from './bridge-instance.js';
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
  /** Canonical subscription (plan + status + endsAt). Populated by session.snapshot. */
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

export interface BridgeSurface {
  app: BridgeAppSurface;
  tenant: BridgeTenantSurface;
  /** Authenticated user (id/email/role/tenantId). Populated by session.snapshot. */
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

export const bridge: BridgeSurface = {
  app: {
    branding: appBrandingStore,
    plans: _plansSlice,
  },
  tenant: {
    id: tenantIdStore,
    name: tenantNameStore,
    subscription: tenantSubscriptionStore,
    entitlements: {
      snapshot: tenantEntitlementsStore,
      can: entitlementsCan,
    },
  },
  user: userSnapshotStore,
  attributes: _devAttributes,
  events: bridgeEvents,
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
