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
  type RealtimeClientConfig,
  type SessionSnapshotMessage,
  type UserStateMessage,
  useBridge,
} from '@nebulr-group/bridge-auth-core';

import { getConfig } from '../client/stores/config.store.js';
import { getBridgeAuth, tokenStore } from './bridge-instance.js';
import { applySessionSnapshot } from './snapshot-stores.js';
import { bridgeEvents } from './events.js';
import { _setRealtimeStatus } from './realtime-status.js';

let _realtime: RealtimeClient | undefined;
let _unsubscribeAuth: (() => void) | undefined;
let _currentAuthToken: string | undefined;

const _onOpenSubs: Set<() => void> = new Set();
const _onCloseSubs: Set<() => void> = new Set();
const _onSnapshotSubs: Set<(msg: SessionSnapshotMessage) => void> = new Set();
const _onUserStateSubs: Set<(event: { reason: string }) => void> = new Set();

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
export function startBridgeRuntime(options: StartBridgeRuntimeOptions = {}): void {
  if (_realtime) return;

  const config = getConfig();

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
  });

  _realtime.setOnOpen(() => {
    _setRealtimeStatus('open');
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
  useBridge().handle({
    'subscription.plan_changed': (msg) => bridgeEvents._dispatch(msg),
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
    'entitlements.changed': (msg) => bridgeEvents._dispatch(msg),
  });

  // Token store subscription — owns realtime channel scoping + quotas HTTP
  // options + reauthorize on token-only refresh. Capability-specific subs
  // (e.g. flag eval context) are layered on top by their own bootstrappers.
  const apiBaseUrl = config.apiBaseUrl ?? 'https://api.thebridge.dev';
  _unsubscribeAuth = tokenStore.subscribe((tokens) => {
    const prevAuthToken = _currentAuthToken;
    _currentAuthToken = tokens?.accessToken;

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
      return;
    }

    const claims = decodeJwtPayload(tokens.accessToken);
    if (!claims) return;

    // Wire all three SDK channel scopes from the JWT. `aid` → app, `tid` →
    // workspace, `sub` → user. Each setter is idempotent; only changes trigger
    // a reconnect.
    _realtime!.setAppId(typeof claims.aid === 'string' ? claims.aid : undefined);
    _realtime!.setWorkspaceId(typeof claims.tid === 'string' ? claims.tid : undefined);
    _realtime!.setUserId(typeof claims.sub === 'string' ? claims.sub : undefined);

    // Token-only refresh (same user, new JWT): setUserId is a no-op when
    // userId hasn't changed, leaving the channel riding the OLD JWT until
    // Centrifugo's connection-token TTL drops it. Force a reauthorize so the
    // server re-validates against the new token immediately.
    if (prevAuthToken && _currentAuthToken && prevAuthToken !== _currentAuthToken) {
      void _realtime!.reauthorize();
    }
  });

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

/** Subscribe to `session.snapshot` messages. Returns an unsubscribe fn. */
export function onBridgeRealtimeSnapshot(
  handler: (msg: SessionSnapshotMessage) => void,
): () => void {
  _onSnapshotSubs.add(handler);
  return () => _onSnapshotSubs.delete(handler);
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
  _onUserStateSubs.clear();
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
