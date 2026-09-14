/**
 * Phase 3 / Phase 4 (TBP-287/319) — `session.snapshot` reactive stores.
 *
 * These mirror the wire shape produced by bridge-api's SessionSnapshotService
 * and are written exactly once per channel-subscribe (initial connect AND
 * every reconnect) by `wire-snapshot.ts`. Consumers read them via the unified
 * `bridge` surface in `src/lib/core/bridge.ts`.
 *
 * Initial state is `null` for every slice. The first paint reads `null` until
 * the channel connects and the snapshot lands; framework components either
 * gate on null (skeleton) or fall back to defaults baked at consumer site.
 *
 * Stores live in their own module so the snapshot consumer in `createBridgeFlags`
 * can update them without pulling in the whole `bridge-instance` graph
 * (and so unit tests can reset them between cases via `__resetSnapshotStores`).
 */
import { writable, type Readable, type Writable } from 'svelte/store';

export interface BrandingSnapshot {
  logo: string;
  name: string;
  primaryButtonBgColor?: string;
  textColor?: string;
  bgColor?: string;
  fontFamily?: string;
}

export interface SubscriptionSnapshot {
  plan: { slug: string; name: string };
  status: string;
  endsAt?: string;
  gateEngaged?: boolean;
}

export interface UserSnapshot {
  id: string;
  email?: string;
  role: string;
  tenantId: string;
}

const _appBranding: Writable<BrandingSnapshot | null> = writable(null);
const _tenantId: Writable<string | null> = writable(null);
const _tenantName: Writable<string | null> = writable(null);
const _tenantSubscription: Writable<SubscriptionSnapshot | null> = writable(null);
const _tenantEntitlements: Writable<Record<string, boolean> | null> = writable(null);
const _user: Writable<UserSnapshot | null> = writable(null);

// Exported as Readable so consumers can't mutate. The internal writables are
// only reached via the setters below (called from `wire-snapshot.ts`).
export const appBrandingStore: Readable<BrandingSnapshot | null> = _appBranding;
export const tenantIdStore: Readable<string | null> = _tenantId;
export const tenantNameStore: Readable<string | null> = _tenantName;
export const tenantSubscriptionStore: Readable<SubscriptionSnapshot | null> = _tenantSubscription;
export const tenantEntitlementsStore: Readable<Record<string, boolean> | null> = _tenantEntitlements;
export const userSnapshotStore: Readable<UserSnapshot | null> = _user;

export interface SessionSnapshotData {
  app: { branding: BrandingSnapshot };
  tenant: {
    id: string;
    name: string;
    subscription: SubscriptionSnapshot;
    entitlements: Record<string, boolean>;
  };
  user: UserSnapshot;
}

/**
 * Apply a server-emitted snapshot to the reactive stores. Called from the
 * RealtimeClient `setOnSnapshot` callback wired up in `createBridgeFlags`.
 *
 * Side-effect only — never throws. A partial server that omits an inner
 * field leaves the corresponding store unchanged rather than clobbering it
 * with `null`.
 */
export function applySessionSnapshot(data: SessionSnapshotData): void {
  if (data?.app?.branding) _appBranding.set(data.app.branding);
  if (data?.tenant) {
    if (typeof data.tenant.id === 'string') _tenantId.set(data.tenant.id);
    if (typeof data.tenant.name === 'string') _tenantName.set(data.tenant.name);
    if (data.tenant.subscription) _tenantSubscription.set(data.tenant.subscription);
    if (data.tenant.entitlements) _tenantEntitlements.set(data.tenant.entitlements);
  }
  if (data?.user) _user.set(data.user);
}

/**
 * TBP-644 — move `bridge.tenant.subscription` on a `subscription.plan_changed`
 * push. Until now this store was written only by `session.snapshot`, and a plan
 * change never re-sends one, so an upgraded workspace kept rendering its old
 * plan until a reload — while auth-core's `useBridge().subscription`, hydrated
 * from the very same push, already had the new one.
 *
 * The push is authoritative for plan and status (auth-core's contract for it:
 * "consumers hydrate their cached state on receipt; no refetch required").
 * Fields it does not carry (`endsAt`, `gateEngaged`) keep their current value.
 * A payload without a plan slug is ignored. Never throws.
 */
export function applySubscriptionPlanChanged(
  msg: { to?: { slug?: unknown; name?: unknown } | null; status?: unknown } | null | undefined,
): void {
  const slug = msg?.to?.slug;
  if (typeof slug !== 'string' || slug === '') return;
  const name = typeof msg?.to?.name === 'string' ? msg.to.name : slug;
  const status = typeof msg?.status === 'string' ? msg.status : undefined;
  _tenantSubscription.update((current) => ({
    ...(current ?? {}),
    plan: { slug, name },
    status: status ?? current?.status ?? '',
  }));
}

/**
 * TBP-644 — replace `bridge.tenant.entitlements` from an `entitlements.changed`
 * push that carries the map (the slice is documented as "replaced wholesale on
 * every entitlements.changed push", but only `session.snapshot` ever wrote it).
 * The signal-only lifecycle variant of the same kind carries no map and leaves
 * the store untouched. Never throws.
 */
export function applyEntitlementsChanged(msg: { entitlements?: unknown } | null | undefined): void {
  const map = msg?.entitlements;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return;
  _tenantEntitlements.set({ ...(map as Record<string, boolean>) });
}

/** Test-only: reset every snapshot store to `null`. Vitest hook. */
export function __resetSnapshotStores(): void {
  _appBranding.set(null);
  _tenantId.set(null);
  _tenantName.set(null);
  _tenantSubscription.set(null);
  _tenantEntitlements.set(null);
  _user.set(null);
}
