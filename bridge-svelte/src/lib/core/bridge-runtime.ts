/**
 * Bridge core runtime — the realtime + reactive-identity wiring that every
 * Bridge capability (auth, flags, billing, ...) rides on top of.
 *
 * Until TBP-Live-Channel-Unification this lived inside `/flags/bootstrap.ts`,
 * which was misleading: the realtime client, the per-channel auth scoping,
 * the session.snapshot fanout and the billing-family event dispatch are not
 * flag-specific. Hoisting them here lets `<BridgeBootstrap />` mount the
 * runtime once and any capability (flags, billing) attach onto the same
 * RealtimeClient instance.
 *
 * What this module does on `startBridgeRuntime()`:
 *
 *   1. Constructs a single `RealtimeClient` using `appId` + `apiBaseUrl` from
 *      `bridgeConfig.initConfig({...})` (auth's `getConfig()` is the single
 *      source of truth — no separate API base URL config for flags).
 *   2. Calls `useBridge().attachToRealtimeClient(realtime)` so the billing
 *      stores (subscription, quotas, entitlements) react to live pushes.
 *   3. Wires `setOnOpen` / `setOnClose` to mirror connection state into the
 *      reactive `realtimeStatus` store.
 *   4. Wires `setOnSnapshot` to call `applySessionSnapshot(...)` (drives every
 *      `useBridge()` reactive store) and dispatch the snapshot event through
 *      `bridgeEvents`.
 *   5. Wires `setOnUserState` so a server-side claims-change signal forces a
 *      `refreshTokens()` on BridgeAuth — the fresh JWT then flows back through
 *      the tokenStore subscription below.
 *   6. Subscribes to `tokenStore`: identity tracking for the realtime channel
 *      (setAppId/setWorkspaceId/setUserId), explicit reauthorize on
 *      token-only refresh, and re-configuration of the `useBridge().quotas`
 *      HTTP options so quota hydrate requests carry the current access token.
 *   7. Registers the canonical billing-family event handlers via
 *      `useBridge().handle({...})` so `subscription.*` / `payment.*` /
 *      `dunning.*` / `quota.updated` / `entitlements.changed` flow into
 *      `bridgeEvents._dispatch()`.
 *   8. Exposes chainable `onBridgeRealtimeOpen` / `onBridgeRealtimeClose` /
 *      `onBridgeRealtimeSnapshot` subscriber sets so individual capability
 *      bootstrappers (flag attach, etc.) can layer their own behavior without
 *      clobbering the core handlers (`setOn*` on RealtimeClient is single-slot).
 *
 * `startBridgeRuntime()` is idempotent — repeated calls return the existing
 * instance. Call `stopBridgeRuntime()` (e.g. on `<BridgeBootstrap />` destroy)
 * to flush the realtime client and unsubscribe from the token store.
 */
import {
  RealtimeClient,
  type FlagChange,
  type RealtimeClientConfig,
  type RealtimeStatus,
  type SessionSnapshotMessage,
  type UserStateMessage,
  useBridge,
} from '@nebulr-group/bridge-auth-core';

import { getConfig } from '../client/stores/config.store.js';
import { getBridgeAuth, tokenStore } from './bridge-instance.js';
import { wrapFetchWithBridgeAuth } from './bridge-fetch.js';
import {
  applyEntitlementsChanged,
  applySessionSnapshot,
  applySubscriptionPlanChanged,
} from './snapshot-stores.js';
import { bridgeEvents } from './events.js';
import { _setRealtimeStatus, _setRealtimeStatusDetail } from './realtime-status.js';
import { invalidateRouteGuardCache } from '../auth/guard-cache.js';

/**
 * Why the route-guard cache was invalidated (TBP-654): a plan change, an
 * entitlements change, a server-side user state change, or a new access token
 * (sign-in, refresh, sign-out).
 */
export type BridgeAuthorizationChangeReason =
  | 'subscription.plan_changed'
  | 'entitlements.changed'
  | 'user.state_changed'
  | 'token';

let _realtime: RealtimeClient | undefined;
let _unsubscribeAuth: (() => void) | undefined;
let _currentAuthToken: string | undefined;
let _originalFetch: typeof fetch | undefined;

const _onOpenSubs: Set<() => void> = new Set();
const _onCloseSubs: Set<() => void> = new Set();
const _onSnapshotSubs: Set<(msg: SessionSnapshotMessage) => void> = new Set();
// TBP-575 — realtime flag mutations, fanned out so the route guard can
// invalidate its (separate) cache and re-evaluate the current route.
const _onFlagChangeSubs: Set<(change: FlagChange) => void> = new Set();
const _onUserStateSubs: Set<(event: { reason: string }) => void> = new Set();
// TBP-644 — full realtime status (state + reason + whose side + retrying).
const _onStatusSubs: Set<(status: RealtimeStatus) => void> = new Set();
// TBP-654 — anything that can change a route verdict without changing a flag.
const _onAuthorizationChangeSubs: Set<(reason: BridgeAuthorizationChangeReason) => void> = new Set();

// TBP-654 — route guards read auth-core's FeatureFlagService (5-min TTL), and
// a plan-targeted rule's verdict depends on the user's plan and token, not on
// the flag definition. Before this, only a realtime FLAG change cleared that
// cache, so an upgraded user stayed locked out of the page they had just paid
// for until the TTL ran out or they reloaded.
//
// Called exactly once per triggering event, and always BEFORE the event is
// dispatched to app handlers, so a handler that navigates is evaluated
// against fresh state. Invalidation is free (no fetch); the refetch happens at
// the next route evaluation, and the re-check subscribers debounce bursts
// (plan_changed + entitlements.changed + user.state_changed + the token
// refresh they cause all arrive within a second).
function authorizationChanged(reason: BridgeAuthorizationChangeReason): void {
  invalidateRouteGuardCache();
  for (const fn of _onAuthorizationChangeSubs) {
    try { fn(reason); } catch { /* subscriber errors swallowed */ }
  }
}

/**
 * Advanced runtime overrides. Product consumers never pass these; tests,
 * Storybook harnesses, and the demo workspace use them to override the
 * realtime transport (e.g. inject a debug-instrumented WebSocket) or watch
 * `user.state_changed` signals for visualization.
 */
export interface StartBridgeRuntimeOptions {
  /**
   * Pass-through realtime overrides. `apiBaseUrl`, `apiKey`, `appId`, and
   * `getAuthToken` are owned by the runtime and ignored here.
   */
  realtime?: Partial<Omit<RealtimeClientConfig, 'apiBaseUrl' | 'apiKey' | 'appId' | 'getAuthToken'>>;
}

/**
 * Start the Bridge runtime. Idempotent — repeated calls are a no-op. Reads
 * `appId` + `apiBaseUrl` from the auth config store (`bridgeConfig.initConfig`).
 * Must be called AFTER `bridgeConfig.initConfig({...})` runs — typically from
 * `<BridgeBootstrap />`'s onMount.
 */
/**
 * Patch globalThis.fetch so every request to the bridge API automatically
 * gets the current access token injected as Authorization: Bearer, and
 * TOKEN_VERSION_STALE responses are retried with a fresh token.
 *
 * Idempotent — safe to call from both bridgeBootstrap() (load-function context,
 * before any component mounts) and startBridgeRuntime() (onMount). Whichever
 * runs first installs the patch; the second call is a no-op.
 * Restored by stopBridgeRuntime().
 */
export function installBridgeAuthFetch(): void {
  if (_originalFetch) return; // already installed
  if (typeof globalThis === 'undefined' || typeof globalThis.fetch === 'undefined') return;
  const config = getConfig();
  _originalFetch = globalThis.fetch;
  globalThis.fetch = wrapFetchWithBridgeAuth(_originalFetch, config.apiBaseUrl ?? 'https://api.thebridge.dev');
}

export function startBridgeRuntime(options: StartBridgeRuntimeOptions = {}): void {
  if (_realtime) return;

  const config = getConfig();

  installBridgeAuthFetch();

  // `appId` may come from BridgeAuth's API context if available; falls back
  // to the value from `getConfig()`. The auth context one is what gets bound
  // to the per-app channel scope at boot, before any user JWT arrives.
  let _bootstrapAppId: string | undefined = config.appId;
  try {
    _bootstrapAppId = getBridgeAuth().getApiContext().appId ?? config.appId;
  } catch {
    // BridgeAuth singleton not constructed yet — fall through with config.appId.
  }

  _realtime = new RealtimeClient({
    ...(options.realtime ?? {}),
    apiBaseUrl: config.apiBaseUrl ?? 'https://api.thebridge.dev',
    apiKey: config.appId,
    appId: _bootstrapAppId,
    getAuthToken: () => _currentAuthToken,
    // TBP-644 — a refused connection gets ONE session refresh per episode
    // (auth-core enforces the once) and reconnects with the new token instead
    // of parking. A signed-out session has nothing to refresh. Loop safety:
    // the refreshed token lands in the tokenStore subscription below, whose
    // reauthorize() is a no-op while that episode is still connecting, and
    // the reconnect it produces is flagged self-induced so setOnOpen does not
    // refresh a second time.
    refreshAuthToken:
      options.realtime?.refreshAuthToken ??
      (async () => {
        if (!_currentAuthToken) return undefined;
        try {
          const tokens = await getBridgeAuth().refreshTokens();
          return tokens?.accessToken ?? undefined;
        } catch {
          return undefined;
        }
      }),
  });

  let _connectedOnce = false;
  // Set just before we call _realtime.reauthorize() so the resulting
  // reconnect's setOnOpen handler knows the token is already fresh and skips
  // its proactive refresh — see the loop note in setOnOpen below.
  let _reauthInFlight = false;
  _realtime.setOnOpen(() => {
    _setRealtimeStatus('open');
    // On reconnect (not initial connect), proactively refresh tokens.
    // If the WS was down when tokenVersion was bumped on the server, the
    // client missed the user.state_changed broadcast. Refreshing here
    // syncs tokens before the first post-reconnect request can fail with
    // TOKEN_VERSION_STALE.
    //
    // EXCEPT when this reconnect was caused by our OWN reauthorize() below
    // (a token-only refresh). In that case the token is already current, so
    // refreshing again would mint yet another JWT, which the tokenStore
    // subscription would see as a change and reauthorize() again → reconnect
    // → setOnOpen → refresh → … an unbounded loop that hammers /auth/token
    // (observed ~32 cycles/sec, jamming the page's main thread and stalling
    // every downstream wait). Only genuine, externally-triggered reconnects
    // (network blips, server restarts) should trigger the catch-up refresh.
    const causedByReauthorize = _reauthInFlight;
    _reauthInFlight = false;
    if (_connectedOnce && !causedByReauthorize) {
      getBridgeAuth().refreshTokens().catch(() => { /* best-effort; wrapFetchWithBridgeAuth is the hard fallback */ });
    }
    _connectedOnce = true;
    for (const fn of _onOpenSubs) {
      try { fn(); } catch { /* subscriber errors swallowed */ }
    }
  });

  _realtime.setOnClose(() => {
    _setRealtimeStatus('closed');
    for (const fn of _onCloseSubs) {
      try { fn(); } catch { /* subscriber errors swallowed */ }
    }
  });

  // TBP-575 — connected, handshaken, and subscribed to nothing. Distinct from
  // 'closed': the socket is alive, so no reconnect is coming, but nothing will
  // ever arrive on it. Surfacing this is the whole point — this state used to
  // report as 'open'.
  // Guarded: bridge-svelte and auth-core version independently, so a consumer
  // can resolve an older auth-core that has no such hook. An unguarded call
  // would crash bootstrap — a worse failure than the missing signal.
  _realtime.setOnDegraded?.(() => {
    _setRealtimeStatus('degraded');
  });

  // TBP-644 — the full status: why the connection is not working, whose side
  // the fault is on, and whether it is still retrying. Guarded for the same
  // reason as setOnDegraded (an older auth-core has no such hook; the
  // open/close/degraded mirrors above keep `realtimeStatus` working there).
  _realtime.setOnStatusChange?.((status) => {
    _setRealtimeStatusDetail(status);
    // A parked client never opens, so a reauthorize that ended in a refusal
    // must not leave the self-induced flag set for the next genuine reconnect.
    if (status.state === 'unauthorized') _reauthInFlight = false;
    for (const fn of _onStatusSubs) {
      try { fn(status); } catch { /* subscriber errors swallowed */ }
    }
  });

  // TBP-575 — a flag changed on the wire. Two caches need to hear about it and
  // only one of them was ever told:
  //   - BridgeFlags (FF 2.0)      — driven by realtime already, via attach()
  //   - FeatureFlagService        — what ROUTE GUARDS read, 5-min TTL, deaf
  // Invalidating here is what makes a route flag take effect on the next
  // navigation instead of up to five minutes later.
  _realtime.setOnFlagChange?.((change) => {
    invalidateRouteGuardCache();
    for (const fn of _onFlagChangeSubs) {
      try { fn(change); } catch { /* subscriber errors swallowed */ }
    }
  });

  _realtime.setOnSnapshot((msg) => {
    try { applySessionSnapshot(msg.data); } catch { /* store updates shouldn't throw, defensive */ }
    bridgeEvents._dispatch(msg);
    for (const fn of _onSnapshotSubs) {
      try { fn(msg); } catch { /* subscriber errors swallowed */ }
    }
  });

  // user.state_changed → JWT refresh. The fresh tokens flow back through the
  // tokenStore subscription below and re-bind channel scopes / re-eval flags.
  _realtime.setOnUserState(async (msg: UserStateMessage) => {
    // TBP-654 — role/attribute changes can flip a route verdict.
    authorizationChanged('user.state_changed');
    for (const fn of _onUserStateSubs) {
      try { fn({ reason: msg.reason }); } catch { /* subscriber errors swallowed */ }
    }
    try { await getBridgeAuth().refreshTokens(); } catch { /* next scheduled refresh will pick it up */ }
  });

  // Billing 2.0 US-11 — bind the billing stores to this realtime client so
  // subscription / quotas / entitlements react to live pushes.
  useBridge().attachToRealtimeClient(_realtime);

  // Phase 5 (TBP-331) + TBP-360 — billing-family events flow through the
  // unified bridge events surface via `useBridge().handle({...})`.
  //
  // TBP-644 — the two pushes that carry the complete new value also move the
  // `bridge.tenant.*` stores, which were otherwise written only by
  // `session.snapshot`. A plan change never re-sends a snapshot, so without
  // this an upgraded app kept rendering the old plan until a reload. The store
  // is patched BEFORE dispatch so a `bridge.events` handler that reads
  // `bridge.tenant.subscription` already sees the new plan.
  useBridge().handle({
    'subscription.plan_changed': (msg) => {
      try { applySubscriptionPlanChanged(msg); } catch { /* store updates shouldn't throw, defensive */ }
      authorizationChanged('subscription.plan_changed');
      bridgeEvents._dispatch(msg);
    },
    'payment.failed': (msg) => bridgeEvents._dispatch(msg),
    'payment.succeeded': (msg) => bridgeEvents._dispatch(msg),
    'subscription.created': (msg) => bridgeEvents._dispatch(msg),
    'subscription.updated': (msg) => bridgeEvents._dispatch(msg),
    'subscription.canceled': (msg) => bridgeEvents._dispatch(msg),
    'subscription.reactivated': (msg) => bridgeEvents._dispatch(msg),
    'subscription.trial_started': (msg) => bridgeEvents._dispatch(msg),
    'subscription.trial_ending_soon': (msg) => bridgeEvents._dispatch(msg),
    'subscription.trial_converted': (msg) => bridgeEvents._dispatch(msg),
    'subscription.trial_expired': (msg) => bridgeEvents._dispatch(msg),
    'dunning.entered': (msg) => bridgeEvents._dispatch(msg),
    'dunning.retry_scheduled': (msg) => bridgeEvents._dispatch(msg),
    'dunning.recovered': (msg) => bridgeEvents._dispatch(msg),
    'dunning.exhausted': (msg) => bridgeEvents._dispatch(msg),
    'quota.updated': (msg) => bridgeEvents._dispatch(msg),
    'entitlements.changed': (msg) => {
      // Only the payload-carrying variant has a map; the signal-only one is a no-op here.
      try { applyEntitlementsChanged(msg as { entitlements?: unknown }); } catch { /* defensive */ }
      authorizationChanged('entitlements.changed');
      bridgeEvents._dispatch(msg);
    },
  });

  // Token store subscription — owns realtime channel scoping + quotas HTTP
  // options + reauthorize on token-only refresh. Capability-specific subs
  // (e.g. flag eval context) are layered on top by their own bootstrappers.
  const apiBaseUrl = config.apiBaseUrl ?? 'https://api.thebridge.dev';

  // TBP-644 — the realtime connection must be re-authorized whenever the
  // token VALUE changes: rotation (A → B), but also first sign-in
  // (none → A) and sign-out (A → none). Keying this on rotation only meant a
  // session that signed in after page load kept the anonymous connection —
  // or stayed parked after a refusal — until something else reconnected it.
  // Flagged self-induced so setOnOpen skips its catch-up refresh (see the
  // loop note there): the token we reconnect with is already current.
  const reauthorizeForTokenChange = () => {
    _reauthInFlight = true;
    void _realtime!.reauthorize();
  };
  // `subscribe` emits the current value synchronously, before `start()` below.
  // That first emission is not a change: start() connects with it anyway.
  let _tokenSubscriptionLive = false;
  _unsubscribeAuth = tokenStore.subscribe((tokens) => {
    const prevAuthToken = _currentAuthToken;
    _currentAuthToken = tokens?.accessToken ?? undefined;
    const tokenChanged = _tokenSubscriptionLive && prevAuthToken !== _currentAuthToken;

    // TBP-654 + TBP-653 — a new token (sign-in, refresh after a plan change,
    // sign-out) invalidates every verdict taken with the old one, and the
    // current route is re-evaluated: a signed-out session on a protected page
    // goes to login instead of inheriting the signed-in decision.
    if (tokenChanged) authorizationChanged('token');

    // Quota store hydrate requests carry the current access token; configure
    // here so post-login state is picked up. Best-effort: a missing
    // BridgeAuth means SDK isn't fully initialized yet — skip.
    try {
      const auth = getBridgeAuth();
      useBridge().quotas.configure({
        apiBaseUrl,
        appId: auth.getApiContext().appId,
        accessToken: tokens?.accessToken ?? null,
      });
    } catch {
      // No BridgeAuth yet — quota hydration falls back to live pushes only.
    }

    if (!tokens?.accessToken) {
      // Logout — drop user + workspace channel scopes. The app channel keeps
      // its anonymous app-id auth.
      _realtime!.setUserId(undefined);
      _realtime!.setWorkspaceId(undefined);
      // Reconnect as the signed-out session now, rather than riding the old
      // user's socket until something else drops it.
      if (tokenChanged) reauthorizeForTokenChange();
      return;
    }

    const claims = decodeJwtPayload(tokens.accessToken);
    if (claims) {
      // Wire all three SDK channel scopes from the JWT. `aid` → app, `tid` →
      // workspace, `sub` → user. Each setter is idempotent; only changes
      // trigger a reconnect.
      _realtime!.setAppId(typeof claims.aid === 'string' ? claims.aid : undefined);
      _realtime!.setWorkspaceId(typeof claims.tid === 'string' ? claims.tid : undefined);
      _realtime!.setUserId(typeof claims.sub === 'string' ? claims.sub : undefined);
    }

    // setUserId is a no-op when the user is unchanged (token-only refresh),
    // and a setter-driven reconnect waits out a backoff and cannot lift a
    // parked refusal — so reauthorize explicitly on every value change.
    if (tokenChanged) reauthorizeForTokenChange();
  });
  _tokenSubscriptionLive = true;

  // Best-effort start. RealtimeClient gracefully no-ops if the workspace's
  // `/realtime/config` returns `kind: 'noop'`.
  void _realtime.start();
}

/**
 * Stop the runtime. Idempotent — safe to call without a prior start. Flushes
 * the realtime client and unsubscribes from the token store. Subscriber sets
 * are NOT cleared so re-start picks up existing capability extensions.
 */
export async function stopBridgeRuntime(): Promise<void> {
  if (_unsubscribeAuth) {
    _unsubscribeAuth();
    _unsubscribeAuth = undefined;
  }
  if (_realtime) {
    try { await _realtime.stop(); } catch { /* already stopped, ignore */ }
    _realtime = undefined;
  }
  _currentAuthToken = undefined;
  if (_originalFetch) {
    globalThis.fetch = _originalFetch;
    _originalFetch = undefined;
  }
}

/**
 * Get the shared RealtimeClient. Returns `undefined` if `startBridgeRuntime()`
 * hasn't run yet. Used by capability bootstrappers (e.g. flag attach) to
 * register their own bridge/cache against the same channel.
 */
export function getBridgeRealtime(): RealtimeClient | undefined {
  return _realtime;
}

/**
 * Get the current access token cached for the realtime client's
 * `getAuthToken` closure. Capability bootstrappers may need it for their own
 * auth-sensitive operations (e.g. flag hydrate). Returns `undefined` when
 * the user is logged out.
 */
export function getCurrentAuthToken(): string | undefined {
  return _currentAuthToken;
}

/** Subscribe to realtime `open` events. Returns an unsubscribe fn. */
export function onBridgeRealtimeOpen(handler: () => void): () => void {
  _onOpenSubs.add(handler);
  return () => _onOpenSubs.delete(handler);
}

/** Subscribe to realtime `close` events. Returns an unsubscribe fn. */
export function onBridgeRealtimeClose(handler: () => void): () => void {
  _onCloseSubs.add(handler);
  return () => _onCloseSubs.delete(handler);
}

/**
 * Subscribe to realtime flag mutations (TBP-575). Returns an unsubscribe fn.
 *
 * The route-guard cache is already invalidated before subscribers run, so a
 * handler that re-evaluates a route will read fresh values.
 */
export function onBridgeFlagChange(handler: (change: FlagChange) => void): () => void {
  _onFlagChangeSubs.add(handler);
  return () => _onFlagChangeSubs.delete(handler);
}

/** Subscribe to `session.snapshot` messages. Returns an unsubscribe fn. */
export function onBridgeRealtimeSnapshot(
  handler: (msg: SessionSnapshotMessage) => void,
): () => void {
  _onSnapshotSubs.add(handler);
  return () => _onSnapshotSubs.delete(handler);
}

/**
 * Subscribe to realtime status changes (TBP-644): state, the machine-readable
 * reason, whose side a fault is on (`app` / `config` / `bridge` / `network`),
 * whether the client is still retrying, a docs link and a support ref.
 * Fires on every change, not with the current value — read
 * `realtimeStatusDetail` for that. Returns an unsubscribe fn.
 */
export function onBridgeRealtimeStatus(handler: (status: RealtimeStatus) => void): () => void {
  _onStatusSubs.add(handler);
  return () => _onStatusSubs.delete(handler);
}

/**
 * Subscribe to changes that can alter a route guard's verdict without a flag
 * changing (TBP-654): plan change, entitlements change, user state change, new
 * access token. The route-guard cache is already invalidated when subscribers
 * run. Returns an unsubscribe fn.
 */
export function onBridgeAuthorizationChange(
  handler: (reason: BridgeAuthorizationChangeReason) => void,
): () => void {
  _onAuthorizationChangeSubs.add(handler);
  return () => _onAuthorizationChangeSubs.delete(handler);
}

/**
 * Subscribe to server-side `user.state_changed` signals (fired before the
 * runtime triggers a token refresh). Useful for debug overlays + tests.
 */
export function onBridgeRealtimeUserState(
  handler: (event: { reason: string }) => void,
): () => void {
  _onUserStateSubs.add(handler);
  return () => _onUserStateSubs.delete(handler);
}

/**
 * Test-only — reset module-level state. Use between unit tests to avoid
 * cross-test bleed in the realtime client + subscriber sets.
 */
export function __resetBridgeRuntime(): void {
  _onOpenSubs.clear();
  _onCloseSubs.clear();
  _onSnapshotSubs.clear();
  _onFlagChangeSubs.clear();
  _onUserStateSubs.clear();
  _onStatusSubs.clear();
  _onAuthorizationChangeSubs.clear();
  _currentAuthToken = undefined;
  if (_unsubscribeAuth) {
    _unsubscribeAuth();
    _unsubscribeAuth = undefined;
  }
  _realtime = undefined;
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** Decode a JWT payload without signature verification (client context only). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
