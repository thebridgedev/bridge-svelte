// Unit tests for the hoisted Bridge core runtime.
//
// Covers the contract surface around `startBridgeRuntime` / subscriber sets /
// `getBridgeRealtime`. Heavy stubbing — auth-core's RealtimeClient + useBridge
// are mocked so we can drive open/close/snapshot/user-state events and assert
// they fan out to subscribers + the realtimeStatus store + bridgeEvents.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writable, type Writable, get } from 'svelte/store';

// ── Test fixtures ──────────────────────────────────────────────────────────

type TokenSet = { accessToken: string | null; refreshToken?: string | null } | null;
let _tokenStore: Writable<TokenSet>;

// Captured event handlers so tests can fire them.
let _onOpen: (() => void) | undefined;
let _onClose: (() => void) | undefined;
let _onSnapshot: ((msg: { kind: string; data: unknown }) => void) | undefined;
let _onDegraded: (() => void) | undefined;
let _invalidateCalls = 0;
let _onFlagChange: ((change: { key: string; kind: string }) => void) | undefined;
let _onUserState: ((msg: { reason: string }) => Promise<void> | void) | undefined;
let _onStatusChange: ((status: Record<string, unknown>) => void) | undefined;
let _refreshCalls = 0;
let _refreshImpl: (() => unknown) | undefined;
let _refreshThrows = false;

const _channelScopeCalls: Array<{ method: string; value: string | undefined }> = [];
const _reauthCalls: number[] = [];
let _startCalls = 0;
let _stopCalls = 0;
let _capturedRealtimeConfig: Record<string, unknown> | undefined;

// Reset the spy state between tests.
function resetSpies() {
  _onOpen = _onClose = _onSnapshot = _onUserState = undefined;
  _onDegraded = undefined;
  _onFlagChange = undefined;
  _invalidateCalls = 0;
  _channelScopeCalls.length = 0;
  _reauthCalls.length = 0;
  _startCalls = 0;
  _stopCalls = 0;
  _capturedRealtimeConfig = undefined;
  _onStatusChange = undefined;
  _refreshCalls = 0;
  _refreshImpl = undefined;
  _refreshThrows = false;
}

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('./bridge-instance.js', () => ({
  get tokenStore() {
    return _tokenStore;
  },
  getBridgeAuth: () => ({
    getApiContext: () => ({ appId: 'app-1', accessToken: null }),
    refreshTokens: async () => {
      _refreshCalls += 1;
      if (_refreshThrows) throw new Error('refresh failed');
      return _refreshImpl ? _refreshImpl() : null;
    },
    invalidateFeatureFlagCache: () => { _invalidateCalls += 1; },
  }),
}));

vi.mock('../client/stores/config.store.js', () => ({
  getConfig: () => ({ appId: 'app-1', apiBaseUrl: 'http://test' }),
}));

// The billing-family handler table the runtime registers via useBridge().handle().
let _billingHandlers: Record<string, (msg: unknown) => void> | undefined;

vi.mock('./snapshot-stores.js', () => ({
  applySessionSnapshot: vi.fn(),
  applySubscriptionPlanChanged: vi.fn(),
  applyEntitlementsChanged: vi.fn(),
}));

vi.mock('./events.js', () => ({
  bridgeEvents: { _dispatch: vi.fn() },
}));

vi.mock('@nebulr-group/bridge-auth-core', () => {
  class FakeRealtimeClient {
    constructor(config: Record<string, unknown>) {
      _capturedRealtimeConfig = config;
    }
    setOnOpen(fn: () => void) { _onOpen = fn; }
    setOnClose(fn: () => void) { _onClose = fn; }
    setOnSnapshot(fn: (msg: { kind: string; data: unknown }) => void) { _onSnapshot = fn; }
    setOnDegraded(fn: () => void) { _onDegraded = fn; }
    setOnFlagChange(fn: (change: { key: string; kind: string }) => void) { _onFlagChange = fn; }
    setOnUserState(fn: (msg: { reason: string }) => Promise<void> | void) { _onUserState = fn; }
    setOnStatusChange(fn: (status: Record<string, unknown>) => void) { _onStatusChange = fn; }
    setAppId(v: string | undefined) { _channelScopeCalls.push({ method: 'setAppId', value: v }); }
    setWorkspaceId(v: string | undefined) { _channelScopeCalls.push({ method: 'setWorkspaceId', value: v }); }
    setUserId(v: string | undefined) { _channelScopeCalls.push({ method: 'setUserId', value: v }); }
    async reauthorize() { _reauthCalls.push(Date.now()); }
    async start() { _startCalls++; }
    async stop() { _stopCalls++; }
  }
  return {
    RealtimeClient: FakeRealtimeClient,
    useBridge: () => ({
      quotas: { configure: vi.fn() },
      attachToRealtimeClient: vi.fn(),
      handle: vi.fn((handlers: Record<string, (msg: unknown) => void>) => {
        _billingHandlers = handlers;
        return () => {};
      }),
    }),
  };
});

beforeEach(() => {
  _tokenStore = writable<TokenSet>(null);
  resetSpies();
});

afterEach(async () => {
  const { __resetBridgeRuntime, stopBridgeRuntime } = await import('./bridge-runtime.js');
  await stopBridgeRuntime();
  __resetBridgeRuntime();
});

// ── Imports under test ─────────────────────────────────────────────────────

import {
  startBridgeRuntime,
  stopBridgeRuntime,
  getBridgeRealtime,
  onBridgeRealtimeOpen,
  onBridgeRealtimeClose,
  onBridgeRealtimeSnapshot,
  onBridgeRealtimeUserState,
  onBridgeFlagChange,
  onBridgeRealtimeStatus,
} from './bridge-runtime.js';
import { realtimeStatus, realtimeStatusDetail } from './realtime-status.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeJwt(claims: Record<string, unknown>): string {
  const enc = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(claims)}.sig`;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('startBridgeRuntime', () => {
  it('is idempotent — repeated calls do not construct a second realtime client', () => {
    startBridgeRuntime();
    const first = getBridgeRealtime();
    startBridgeRuntime();
    const second = getBridgeRealtime();
    expect(first).toBe(second);
    expect(_startCalls).toBe(1);
  });

  it('reads apiBaseUrl + appId from getConfig()', () => {
    startBridgeRuntime();
    expect(_capturedRealtimeConfig?.apiBaseUrl).toBe('http://test');
    expect(_capturedRealtimeConfig?.apiKey).toBe('app-1');
  });

  it('mirrors connection state into realtimeStatus on open/close', () => {
    startBridgeRuntime();
    _onOpen?.();
    expect(get(realtimeStatus)).toBe('open');
    _onClose?.();
    expect(get(realtimeStatus)).toBe('closed');
  });
});

describe('chainable subscriber sets', () => {
  it('fans out open events to every subscriber', () => {
    const a = vi.fn();
    const b = vi.fn();
    onBridgeRealtimeOpen(a);
    onBridgeRealtimeOpen(b);
    startBridgeRuntime();
    _onOpen?.();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes cleanly', () => {
    const a = vi.fn();
    const unsub = onBridgeRealtimeOpen(a);
    startBridgeRuntime();
    unsub();
    _onOpen?.();
    expect(a).not.toHaveBeenCalled();
  });

  it('isolates subscriber errors — one throwing handler does not block others', () => {
    const a = vi.fn(() => { throw new Error('boom'); });
    const b = vi.fn();
    onBridgeRealtimeOpen(a);
    onBridgeRealtimeOpen(b);
    startBridgeRuntime();
    _onOpen?.();
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
  });

  it('dispatches session.snapshot to bridgeEvents + applySessionSnapshot + subscribers', async () => {
    const { bridgeEvents } = await import('./events.js');
    const { applySessionSnapshot } = await import('./snapshot-stores.js');
    const sub = vi.fn();
    onBridgeRealtimeSnapshot(sub);
    startBridgeRuntime();
    _onSnapshot?.({ kind: 'session.snapshot', data: { user: { id: 'u' } } });
    expect(applySessionSnapshot).toHaveBeenCalledWith({ user: { id: 'u' } });
    expect(bridgeEvents._dispatch).toHaveBeenCalled();
    expect(sub).toHaveBeenCalled();
  });

  it('forwards user.state_changed events to onBridgeRealtimeUserState subscribers', async () => {
    const sub = vi.fn();
    onBridgeRealtimeUserState(sub);
    startBridgeRuntime();
    await _onUserState?.({ reason: 'role.changed' });
    expect(sub).toHaveBeenCalledWith({ reason: 'role.changed' });
  });
});

describe('token store subscription', () => {
  it('binds channel scopes from JWT claims on login', () => {
    startBridgeRuntime();
    // `tokenStore.subscribe` fires immediately with the current value (null)
    // — that emits a `setUserId(undefined)` first. Clear so we only see the
    // login emission.
    _channelScopeCalls.length = 0;
    _tokenStore.set({ accessToken: makeJwt({ sub: 'user-1', tid: 'tenant-7', aid: 'app-1' }) });
    const userCall = _channelScopeCalls.find((c) => c.method === 'setUserId');
    const tenantCall = _channelScopeCalls.find((c) => c.method === 'setWorkspaceId');
    expect(userCall?.value).toBe('user-1');
    expect(tenantCall?.value).toBe('tenant-7');
  });

  it('clears user + workspace scopes on logout but keeps app scope', () => {
    startBridgeRuntime();
    _tokenStore.set({ accessToken: makeJwt({ sub: 'user-1', tid: 'tenant-7' }) });
    _channelScopeCalls.length = 0;
    _tokenStore.set(null);
    expect(_channelScopeCalls).toEqual([
      { method: 'setUserId', value: undefined },
      { method: 'setWorkspaceId', value: undefined },
    ]);
  });

  it('reauthorizes on token-only refresh (same user, new JWT)', () => {
    startBridgeRuntime();
    _tokenStore.set({ accessToken: makeJwt({ sub: 'user-1' }) });
    _reauthCalls.length = 0;
    _tokenStore.set({ accessToken: makeJwt({ sub: 'user-1', iat: 123 }) });
    expect(_reauthCalls.length).toBe(1);
  });
});

describe('stopBridgeRuntime', () => {
  it('flushes the realtime client and clears the singleton', async () => {
    startBridgeRuntime();
    expect(getBridgeRealtime()).toBeDefined();
    await stopBridgeRuntime();
    expect(getBridgeRealtime()).toBeUndefined();
    expect(_stopCalls).toBe(1);
  });

  it('is safe to call without a prior start', async () => {
    await expect(stopBridgeRuntime()).resolves.not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TBP-575 — route flags were never push-updated.
//
// Route guards read FeatureFlagService (a 5-minute TTL cache fed by
// bulkEvaluate). `<FeatureFlag>` reads BridgeFlags. Realtime only ever wrote to
// the second one, so a flag flip took up to five minutes to affect a route —
// not because the TTL was wrong, but because nothing told that cache anything
// had changed.
// ─────────────────────────────────────────────────────────────────────────────

describe('realtime flag changes reach the route-guard cache (TBP-575)', () => {
  it('invalidates the route-guard flag cache on a flag mutation', () => {
    startBridgeRuntime();
    expect(_invalidateCalls).toBe(0);
    _onFlagChange?.({ key: 'holo-experimental', kind: 'updated' });
    expect(_invalidateCalls).toBe(1);
  });

  it('invalidates on removal too — a deleted flag changes route verdicts', () => {
    startBridgeRuntime();
    _onFlagChange?.({ key: 'holo-experimental', kind: 'removed' });
    expect(_invalidateCalls).toBe(1);
  });

  it('fans the change out to subscribers so they can re-evaluate the route', () => {
    startBridgeRuntime();
    const seen: Array<{ key: string; kind: string }> = [];
    const off = onBridgeFlagChange((c) => seen.push(c));
    _onFlagChange?.({ key: 'holo-experimental', kind: 'updated' });
    expect(seen).toEqual([{ key: 'holo-experimental', kind: 'updated' }]);
    off();
    _onFlagChange?.({ key: 'other', kind: 'updated' });
    expect(seen).toHaveLength(1);
  });

  it('invalidates BEFORE notifying subscribers, so a re-check reads fresh values', () => {
    startBridgeRuntime();
    let invalidatedWhenNotified = -1;
    onBridgeFlagChange(() => { invalidatedWhenNotified = _invalidateCalls; });
    _onFlagChange?.({ key: 'x', kind: 'updated' });
    expect(invalidatedWhenNotified).toBe(1);
  });

  it('a throwing subscriber does not stop the others', () => {
    startBridgeRuntime();
    let reached = false;
    onBridgeFlagChange(() => { throw new Error('boom'); });
    onBridgeFlagChange(() => { reached = true; });
    _onFlagChange?.({ key: 'x', kind: 'updated' });
    expect(reached).toBe(true);
  });
});

describe('degraded realtime is reported as degraded, not open (TBP-575)', () => {
  it('mirrors the degraded state into realtimeStatus', () => {
    startBridgeRuntime();
    _onDegraded?.();
    // A socket that is connected but subscribed to nothing used to report
    // 'open' — which is exactly how a dead transport passed for healthy.
    expect(get(realtimeStatus)).toBe('degraded');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TBP-644 — the runtime only reauthorized on token ROTATION (A → B). A session
// that signed in after page load (none → A) kept the anonymous connection, and
// a client parked after a refusal stayed parked, until something else happened
// to reconnect it.
// ─────────────────────────────────────────────────────────────────────────────

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('reauthorizes on every token value change (TBP-644)', () => {
  it('reauthorizes on first sign-in (no token → token)', () => {
    startBridgeRuntime();
    expect(_reauthCalls.length).toBe(0);
    _tokenStore.set({ accessToken: makeJwt({ sub: 'user-1' }) });
    expect(_reauthCalls.length).toBe(1);
  });

  it('reauthorizes on sign-out (token → no token)', () => {
    startBridgeRuntime();
    _tokenStore.set({ accessToken: makeJwt({ sub: 'user-1' }) });
    _reauthCalls.length = 0;
    _tokenStore.set(null);
    expect(_reauthCalls.length).toBe(1);
  });

  it('does not reauthorize for the value already present at start — start() connects with it', () => {
    _tokenStore.set({ accessToken: makeJwt({ sub: 'user-1' }) });
    startBridgeRuntime();
    expect(_reauthCalls.length).toBe(0);
    expect(_startCalls).toBe(1);
  });

  it('does not reauthorize when the same token is emitted again', () => {
    startBridgeRuntime();
    const token = makeJwt({ sub: 'user-1' });
    _tokenStore.set({ accessToken: token });
    _reauthCalls.length = 0;
    _tokenStore.set({ accessToken: token });
    expect(_reauthCalls.length).toBe(0);
  });

  it('does not treat null → null (signed out, re-emitted) as a change', () => {
    startBridgeRuntime();
    _tokenStore.set({ accessToken: null });
    _tokenStore.set(null);
    expect(_reauthCalls.length).toBe(0);
  });
});

describe('the self-induced refresh loop guard still holds (TBP-644)', () => {
  it('the reconnect caused by a sign-in reauthorize does not fire the on-open refresh', () => {
    startBridgeRuntime();
    _onOpen?.(); // initial, anonymous connect
    _tokenStore.set({ accessToken: makeJwt({ sub: 'user-1' }) }); // → reauthorize
    _onOpen?.(); // the reconnect that reauthorize caused
    expect(_refreshCalls).toBe(0);
  });

  it('a genuine reconnect still refreshes (catch-up for a missed user.state_changed)', () => {
    startBridgeRuntime();
    _onOpen?.();
    _onOpen?.();
    expect(_refreshCalls).toBe(1);
  });

  it('refresh → new token → reauthorize → open stops there instead of refreshing again', async () => {
    startBridgeRuntime();
    _tokenStore.set({ accessToken: makeJwt({ sub: 'user-1', iat: 1 }) });
    _onOpen?.();
    _refreshImpl = () => {
      const t = { accessToken: makeJwt({ sub: 'user-1', iat: 2 }) };
      _tokenStore.set(t);
      return t;
    };
    _onOpen?.(); // genuine reconnect → catch-up refresh → token change → reauthorize
    await flush();
    expect(_refreshCalls).toBe(1);
    _onOpen?.(); // the reauthorize's reconnect
    await flush();
    expect(_refreshCalls).toBe(1);
  });
});

describe('refreshAuthToken is wired into the realtime client (TBP-644)', () => {
  const refreshHook = () =>
    _capturedRealtimeConfig!.refreshAuthToken as () => Promise<string | undefined>;

  it('resolves to the NEW access token from BridgeAuth.refreshTokens()', async () => {
    startBridgeRuntime();
    _tokenStore.set({ accessToken: makeJwt({ sub: 'user-1', iat: 1 }) });
    const fresh = makeJwt({ sub: 'user-1', iat: 2 });
    _refreshImpl = () => {
      _tokenStore.set({ accessToken: fresh });
      return { accessToken: fresh };
    };
    await expect(refreshHook()()).resolves.toBe(fresh);
    expect(_refreshCalls).toBe(1);
  });

  it('a signed-out session has nothing to refresh — resolves undefined without calling refresh', async () => {
    startBridgeRuntime();
    await expect(refreshHook()()).resolves.toBeUndefined();
    expect(_refreshCalls).toBe(0);
  });

  it('a failed refresh resolves undefined instead of throwing', async () => {
    startBridgeRuntime();
    _tokenStore.set({ accessToken: makeJwt({ sub: 'user-1' }) });
    _refreshThrows = true;
    await expect(refreshHook()()).resolves.toBeUndefined();
  });

  it('the reconnect after a refreshAuthToken-driven token change does not refresh a second time', async () => {
    startBridgeRuntime();
    _tokenStore.set({ accessToken: makeJwt({ sub: 'user-1', iat: 1 }) });
    _onOpen?.();
    _refreshImpl = () => {
      const t = { accessToken: makeJwt({ sub: 'user-1', iat: 2 }) };
      _tokenStore.set(t);
      return t;
    };
    await refreshHook()(); // realtime asked for it after a refusal
    _onOpen?.(); // reconnect with the refreshed token
    await flush();
    expect(_refreshCalls).toBe(1);
  });

  it('an app-supplied refreshAuthToken override wins', () => {
    const own = async () => 'own-token';
    startBridgeRuntime({ realtime: { refreshAuthToken: own } });
    expect(_capturedRealtimeConfig!.refreshAuthToken).toBe(own);
  });
});

describe('full realtime status reaches the public API (TBP-644)', () => {
  const unauthorized = {
    state: 'unauthorized',
    reason: 'expired',
    side: 'app',
    retrying: false,
    docsUrl: 'https://thebridge.dev/docs/live-updates/troubleshooting/#expired',
    ref: 'abcd1234',
    since: 1,
  };

  it('propagates to realtimeStatusDetail, realtimeStatus and onBridgeRealtimeStatus', () => {
    const seen: unknown[] = [];
    onBridgeRealtimeStatus((s) => seen.push(s));
    startBridgeRuntime();
    _onStatusChange?.(unauthorized);
    expect(get(realtimeStatusDetail)).toEqual(unauthorized);
    expect(get(realtimeStatus)).toBe('unauthorized');
    expect(seen).toEqual([unauthorized]);
  });

  it('a later open/close mirror does not clobber the detail of the same state', () => {
    startBridgeRuntime();
    const closing = { state: 'closed', reason: 'connection_lost', side: 'network', retrying: true, ref: 'r1', since: 2 };
    _onStatusChange?.(closing);
    _onClose?.();
    expect(get(realtimeStatusDetail)).toEqual(closing);
  });

  it('a parked (unauthorized) client clears the self-induced flag so the next genuine reconnect refreshes', () => {
    startBridgeRuntime();
    _onOpen?.();
    _tokenStore.set({ accessToken: makeJwt({ sub: 'user-1' }) }); // reauthorize → flag set
    _onStatusChange?.(unauthorized); // …but it was refused and parked
    _onOpen?.(); // a later, genuine reconnect
    expect(_refreshCalls).toBe(1);
  });

  it('unsubscribes cleanly', () => {
    const handler = vi.fn();
    const off = onBridgeRealtimeStatus(handler);
    startBridgeRuntime();
    off();
    _onStatusChange?.(unauthorized);
    expect(handler).not.toHaveBeenCalled();
  });
});

// Regression: `subscription.plan_changed` and `entitlements.changed` were only
// dispatched as events, so `bridge.tenant.*` kept the old plan / entitlements
// until a reload (TBP-644, reproduced end to end on stage 2026-09-14).
describe('billing pushes patch the bridge.tenant stores before dispatch (TBP-644)', () => {
  const planChanged = {
    kind: 'subscription.plan_changed',
    tenantId: 'ws-1',
    from: { slug: 'free' },
    to: { slug: 'pro', name: 'Pro' },
    status: 'active',
    effectiveAt: '2026-09-14T15:56:31.654Z',
  };
  const entitlementsChanged = {
    kind: 'entitlements.changed',
    tenantId: 'ws-1',
    effectiveAt: '2026-09-14T15:56:31.605Z',
    entitlements: { app_active: true },
  };

  it('subscription.plan_changed patches the tenant subscription store, then dispatches', async () => {
    const { bridgeEvents } = await import('./events.js');
    const { applySubscriptionPlanChanged } = await import('./snapshot-stores.js');
    const order: string[] = [];
    vi.mocked(applySubscriptionPlanChanged).mockImplementationOnce(() => { order.push('store'); });
    vi.mocked(bridgeEvents._dispatch).mockImplementationOnce(() => { order.push('dispatch'); });
    _billingHandlers = undefined;
    startBridgeRuntime();
    _billingHandlers!['subscription.plan_changed'](planChanged);
    expect(applySubscriptionPlanChanged).toHaveBeenCalledWith(planChanged);
    expect(bridgeEvents._dispatch).toHaveBeenCalledWith(planChanged);
    expect(order).toEqual(['store', 'dispatch']);
  });

  it('entitlements.changed replaces the tenant entitlements store, then dispatches', async () => {
    const { bridgeEvents } = await import('./events.js');
    const { applyEntitlementsChanged } = await import('./snapshot-stores.js');
    const order: string[] = [];
    vi.mocked(applyEntitlementsChanged).mockImplementationOnce(() => { order.push('store'); });
    vi.mocked(bridgeEvents._dispatch).mockImplementationOnce(() => { order.push('dispatch'); });
    _billingHandlers = undefined;
    startBridgeRuntime();
    _billingHandlers!['entitlements.changed'](entitlementsChanged);
    expect(applyEntitlementsChanged).toHaveBeenCalledWith(entitlementsChanged);
    expect(bridgeEvents._dispatch).toHaveBeenCalledWith(entitlementsChanged);
    expect(order).toEqual(['store', 'dispatch']);
  });

  it('a failing store patch still dispatches the event to app handlers', async () => {
    const { bridgeEvents } = await import('./events.js');
    const { applySubscriptionPlanChanged } = await import('./snapshot-stores.js');
    vi.mocked(applySubscriptionPlanChanged).mockImplementationOnce(() => { throw new Error('boom'); });
    _billingHandlers = undefined;
    startBridgeRuntime();
    const msg = { ...planChanged, effectiveAt: 'throwing-case' };
    expect(() => _billingHandlers!['subscription.plan_changed'](msg)).not.toThrow();
    expect(bridgeEvents._dispatch).toHaveBeenCalledWith(msg);
  });
});
