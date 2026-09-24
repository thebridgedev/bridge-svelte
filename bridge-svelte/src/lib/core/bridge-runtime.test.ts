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
  _quotaSnapshots.clear();
  _quotaApplied.length = 0;
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
// What the runtime handed auth-core's EntitlementsStore (TBP-660 catch-up).
const _entitlementsApplied: unknown[] = [];

// As much of auth-core's QuotaStore as the runtime touches (TBP-686). Two
// details are load-bearing and mirror the real store:
//   • `getAll()` hands back a FRESH Map every call, so the quota catch-up's
//     "did a push win the race?" check can only compare snapshot identity.
//   • every apply writes a NEW snapshot object, which is what makes that
//     identity comparison mean "this metric changed", not "the map changed".
type QuotaSnap = { metric: string; used: number; limit: number; remaining: number };
const _quotaSnapshots = new Map<string, QuotaSnap>();
// Every applyInitialSnapshot() the runtime performed, in order.
const _quotaApplied: Array<{ metric: string; snapshot: unknown }> = [];
const _quotaStore = {
  configure: vi.fn(),
  getAll: () => new Map(_quotaSnapshots),
  applyInitialSnapshot: (metric: string, snapshot: QuotaSnap | null) => {
    _quotaApplied.push({ metric, snapshot });
    if (!snapshot) _quotaSnapshots.delete(metric);
    else _quotaSnapshots.set(metric, { ...snapshot });
  },
  // The live `quota.updated` path — used by tests to race a push against an
  // in-flight REST re-read.
  applyQuotaUpdated: (msg: QuotaSnap) => {
    _quotaSnapshots.set(msg.metric, { ...msg });
  },
};

vi.mock('./snapshot-stores.js', () => ({
  applySessionSnapshot: vi.fn(),
  applySubscriptionPlanChanged: vi.fn(),
  applyEntitlementsChanged: vi.fn(),
  applyCatchUpSnapshot: vi.fn(() => ({ planChanged: false, entitlementsChanged: false })),
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
      quotas: _quotaStore,
      attachToRealtimeClient: vi.fn(),
      entitlementsStore: {
        applyEntitlementsChanged: (snapshot: unknown) => { _entitlementsApplied.push(snapshot); },
      },
      handle: vi.fn((handlers: Record<string, (msg: unknown) => void>) => {
        _billingHandlers = handlers;
        return () => {};
      }),
    }),
  };
});

// Any signed-in reconnect now issues a TBP-660 catch-up request. Keep every
// test off the network: the default answer is an unusable 503, and the TBP-660
// tests install their own stub on top.
const _realFetch = globalThis.fetch;

beforeEach(() => {
  _tokenStore = writable<TokenSet>(null);
  resetSpies();
  globalThis.fetch = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
});

afterEach(async () => {
  const { __resetBridgeRuntime, stopBridgeRuntime } = await import('./bridge-runtime.js');
  await stopBridgeRuntime();
  __resetBridgeRuntime();
  globalThis.fetch = _realFetch;
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
  onBridgeAuthorizationChange,
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

// Regression (TBP-654): route guards read a flag cache with a 5-minute TTL
// that only a realtime FLAG change cleared. A plan-targeted rule's verdict
// depends on the plan and token, so an upgraded user stayed locked out of the
// page they had just paid for. Each trigger must invalidate exactly once,
// before the event reaches app handlers.
describe('plan, entitlements, user-state and token changes reach the route-guard cache (TBP-654)', () => {
  const planChanged = {
    kind: 'subscription.plan_changed',
    tenantId: 'ws-1',
    from: { slug: 'free' },
    to: { slug: 'pro', name: 'Pro' },
    status: 'active',
    effectiveAt: '2026-09-15T10:00:00.000Z',
  };
  const entitlementsChanged = {
    kind: 'entitlements.changed',
    tenantId: 'ws-1',
    effectiveAt: '2026-09-15T10:00:00.000Z',
    entitlements: { pro_page: true },
  };

  it('subscription.plan_changed invalidates once, notifies re-check subscribers, then dispatches', async () => {
    const { bridgeEvents } = await import('./events.js');
    const order: string[] = [];
    _billingHandlers = undefined;
    startBridgeRuntime();
    onBridgeAuthorizationChange((reason) => order.push(`recheck:${reason}:${_invalidateCalls}`));
    vi.mocked(bridgeEvents._dispatch).mockImplementationOnce(() => { order.push(`dispatch:${_invalidateCalls}`); });
    _billingHandlers!['subscription.plan_changed'](planChanged);
    expect(_invalidateCalls).toBe(1);
    expect(order).toEqual(['recheck:subscription.plan_changed:1', 'dispatch:1']);
  });

  it('entitlements.changed invalidates once, notifies, then dispatches', async () => {
    const { bridgeEvents } = await import('./events.js');
    const order: string[] = [];
    _billingHandlers = undefined;
    startBridgeRuntime();
    onBridgeAuthorizationChange((reason) => order.push(`recheck:${reason}:${_invalidateCalls}`));
    vi.mocked(bridgeEvents._dispatch).mockImplementationOnce(() => { order.push(`dispatch:${_invalidateCalls}`); });
    _billingHandlers!['entitlements.changed'](entitlementsChanged);
    expect(_invalidateCalls).toBe(1);
    expect(order).toEqual(['recheck:entitlements.changed:1', 'dispatch:1']);
  });

  it('user.state_changed invalidates once, before the token refresh it triggers', async () => {
    // Signed in: a signed-out session has no token to refresh (upgrade race fix).
    _tokenStore.set({ accessToken: makeJwt({ sub: 'u1', tid: 'ws-1', aid: 'app-1' }) });
    startBridgeRuntime();
    let invalidatedAtRefresh = -1;
    _refreshImpl = () => { invalidatedAtRefresh = _invalidateCalls; return null; };
    const reasons: string[] = [];
    onBridgeAuthorizationChange((reason) => reasons.push(reason));
    await _onUserState?.({ reason: 'attributes_changed' });
    expect(_invalidateCalls).toBe(1);
    expect(invalidatedAtRefresh).toBe(1);
    expect(reasons).toEqual(['user.state_changed']);
  });

  it('a new access token invalidates once per change; the start value and a re-emit do not', () => {
    const a = makeJwt({ sub: 'u1', tid: 'ws-1', aid: 'app-1', v: 1 });
    const b = makeJwt({ sub: 'u1', tid: 'ws-1', aid: 'app-1', v: 2 });
    _tokenStore.set({ accessToken: a });
    startBridgeRuntime();
    const reasons: string[] = [];
    onBridgeAuthorizationChange((reason) => reasons.push(reason));
    expect(_invalidateCalls).toBe(0);
    _tokenStore.set({ accessToken: a });
    expect(_invalidateCalls).toBe(0);
    _tokenStore.set({ accessToken: b }); // refresh (e.g. after a plan change)
    expect(_invalidateCalls).toBe(1);
    _tokenStore.set(null); // sign-out
    expect(_invalidateCalls).toBe(2);
    expect(reasons).toEqual(['token', 'token']);
  });

  it('a flag-only change still invalidates exactly once and does not fan out as an authorization change', () => {
    startBridgeRuntime();
    const reasons: string[] = [];
    onBridgeAuthorizationChange((reason) => reasons.push(reason));
    _onFlagChange?.({ key: 'pro-page', kind: 'updated' });
    expect(_invalidateCalls).toBe(1);
    expect(reasons).toEqual([]);
  });

  it('a throwing re-check subscriber does not stop the dispatch', async () => {
    const { bridgeEvents } = await import('./events.js');
    _billingHandlers = undefined;
    startBridgeRuntime();
    onBridgeAuthorizationChange(() => { throw new Error('boom'); });
    const msg = { ...planChanged, effectiveAt: 'throwing-subscriber' };
    expect(() => _billingHandlers!['subscription.plan_changed'](msg)).not.toThrow();
    expect(bridgeEvents._dispatch).toHaveBeenCalledWith(msg);
  });
});

// Regression (TBP-660): a plan change publishes user.state_changed first; the
// token refresh it causes makes the SDK replace its socket, and AppSync has no
// replay, so a subscription.plan_changed published during the swap was lost for
// good — the reconnect our own reauthorize() caused skipped every catch-up.
// Seen in 1 of 8 stage runs. Every reconnect must now re-read the session
// snapshot, once, without re-arming the TBP-644 refresh loop.
describe('every connect catches up on state the socket swap may have lost (TBP-660, TBP-686)', () => {
  const SNAPSHOT = {
    app: { branding: { logo: '', name: 'App' } },
    tenant: {
      id: 'ws-1',
      name: 'Workspace',
      subscription: { plan: { slug: 'pro', name: 'Pro' }, status: 'active' },
      entitlements: { pro_page: true },
    },
    user: { id: 'user-1', role: 'OWNER', tenantId: 'ws-1' },
  };
  const tokenA = makeJwt({ sub: 'user-1', tid: 'ws-1', aid: 'app-1', v: 1 });
  const tokenB = makeJwt({ sub: 'user-1', tid: 'ws-1', aid: 'app-1', v: 2 });
  const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as unknown as Response;

  let realFetch: typeof fetch;
  let fetchCalls: Array<{ url: string; headers: Record<string, string> }>;
  // Receives the requested URL so a test can answer `/session/init` and
  // `/usage/quota/:metric` differently. Tests that only care about the session
  // snapshot ignore the argument.
  let respond: (url: string) => Promise<Response>;

  beforeEach(async () => {
    realFetch = globalThis.fetch;
    fetchCalls = [];
    _entitlementsApplied.length = 0;
    respond = async () => ok(SNAPSHOT);
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ url: String(input), headers: Object.fromEntries(new Headers(init?.headers).entries()) });      return respond(String(input));
    }) as typeof fetch;
    const { applyCatchUpSnapshot } = await import('./snapshot-stores.js');
    vi.mocked(applyCatchUpSnapshot).mockReset();
    vi.mocked(applyCatchUpSnapshot).mockReturnValue({ planChanged: false, entitlementsChanged: false });
  });

  afterEach(async () => {
    await stopBridgeRuntime(); // restores the fetch the runtime wrapped
    globalThis.fetch = realFetch;
  });

  // Signed in, connected, then a token refresh (e.g. after user.state_changed)
  // → reauthorize → the replacement socket opens.
  function signedInThenReauthorized() {
    _tokenStore.set({ accessToken: tokenA });
    startBridgeRuntime();
    _onOpen?.(); // initial connect
    _tokenStore.set({ accessToken: tokenB }); // → reauthorize
    _onOpen?.(); // the replacement socket
  }

  it('the reconnect caused by reauthorize re-fetches the session snapshot and applies it', async () => {
    const { applyCatchUpSnapshot } = await import('./snapshot-stores.js');
    signedInThenReauthorized();
    await vi.waitFor(() => expect(applyCatchUpSnapshot).toHaveBeenCalledWith(SNAPSHOT));
    // Two now: the initial connect catches up as well (TBP-686). This test is
    // about the reauthorize-induced one, so assert the most recent call.
    expect(fetchCalls).toHaveLength(2);
    const reauthCall = fetchCalls[fetchCalls.length - 1];
    expect(reauthCall.url).toBe('http://test/session/init');
    expect(reauthCall.headers.authorization).toBe(`Bearer ${tokenB}`);
    expect(reauthCall.headers['x-app-id']).toBe('app-1');
    // …without re-arming the self-induced token refresh loop (TBP-644).
    expect(_refreshCalls).toBe(0);
  });

  // TBP-686 — this used to assert the opposite: "the initial connect does not
  // fetch — bootstrap already loaded this state". Bootstrap does not. The
  // server publishes the session snapshot fire-and-forget during authorize,
  // before the subscription is live, so on a first connect it loses the race
  // and there is no replay. Measured on stage: 25s after load, tenant id, name,
  // branding and entitlements were all still null and `/session/init` had never
  // been requested. The gate meant the one repair we had was reserved for
  // reconnects, which are exactly the case that did NOT need it.
  it('the initial connect fetches too — the snapshot push loses the race on first connect', async () => {
    _tokenStore.set({ accessToken: tokenA });
    startBridgeRuntime();
    _onOpen?.();
    await flush();
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('http://test/session/init');
    expect(fetchCalls[0].headers.authorization).toBe(`Bearer ${tokenA}`);
  });

  it('a genuine reconnect catches up too, alongside its token refresh', async () => {
    _tokenStore.set({ accessToken: tokenA });
    startBridgeRuntime();
    _onOpen?.(); // initial connect — catches up (TBP-686)
    _onOpen?.(); // a genuine reconnect — catches up and refreshes tokens
    await flush();
    expect(fetchCalls).toHaveLength(2);
    expect(_refreshCalls).toBe(1);
  });

  it('a signed-out session has nothing to catch up on', async () => {
    startBridgeRuntime();
    _onOpen?.();
    _onOpen?.();
    await flush();
    expect(fetchCalls).toHaveLength(0);
  });

  it('opens that land while a catch-up is in flight coalesce into ONE follow-up — no storm', async () => {
    let release!: () => void;
    respond = () => new Promise((resolve) => { release = () => resolve(ok(SNAPSHOT)); });
    signedInThenReauthorized(); // catch-up #1 in flight
    _onOpen?.();
    _onOpen?.();
    _onOpen?.(); // three more reconnects meanwhile
    expect(fetchCalls).toHaveLength(1);
    release();
    await vi.waitFor(() => expect(fetchCalls).toHaveLength(2)); // exactly one follow-up
    release();
    await flush();
    expect(fetchCalls).toHaveLength(2);
  });

  it('a recovered plan change re-runs the route guard, as the lost push would have (TBP-654)', async () => {
    const { applyCatchUpSnapshot } = await import('./snapshot-stores.js');
    vi.mocked(applyCatchUpSnapshot).mockReturnValue({ planChanged: true, entitlementsChanged: false });
    signedInThenReauthorized();
    const invalidatedBefore = _invalidateCalls; // the token change already invalidated once
    const reasons: string[] = [];
    onBridgeAuthorizationChange((reason) => reasons.push(reason));
    await vi.waitFor(() => expect(reasons).toEqual(['subscription.plan_changed']));
    expect(_invalidateCalls).toBe(invalidatedBefore + 1);
  });

  it('recovered entitlements reach auth-core\'s store and the route guard', async () => {
    const { applyCatchUpSnapshot } = await import('./snapshot-stores.js');
    vi.mocked(applyCatchUpSnapshot).mockReturnValue({ planChanged: false, entitlementsChanged: true });
    signedInThenReauthorized();
    const reasons: string[] = [];
    onBridgeAuthorizationChange((reason) => reasons.push(reason));
    await vi.waitFor(() => expect(reasons).toEqual(['entitlements.changed']));
    expect(_entitlementsApplied).toEqual([SNAPSHOT.tenant.entitlements]);
  });

  it('nothing changed → the route guard is left alone', async () => {
    const { applyCatchUpSnapshot } = await import('./snapshot-stores.js');
    signedInThenReauthorized();
    const invalidatedBefore = _invalidateCalls;
    const reasons: string[] = [];
    onBridgeAuthorizationChange((reason) => reasons.push(reason));
    await vi.waitFor(() => expect(applyCatchUpSnapshot).toHaveBeenCalled());
    await flush();
    expect(reasons).toEqual([]);
    expect(_invalidateCalls).toBe(invalidatedBefore);
    expect(_entitlementsApplied).toEqual([]);
  });

  it('a failed catch-up (HTTP error or network) is swallowed and applies nothing', async () => {
    const { applyCatchUpSnapshot } = await import('./snapshot-stores.js');
    respond = async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response;
    signedInThenReauthorized();
    await flush();
    respond = async () => { throw new TypeError('network down'); };
    _onOpen?.();
    await flush();
    // Three attempts: initial connect, the reauthorize reconnect, and this one.
    expect(fetchCalls).toHaveLength(3);
    expect(applyCatchUpSnapshot).not.toHaveBeenCalled();
  });

  it('an answer that lands after the session changed is discarded', async () => {
    const { applyCatchUpSnapshot } = await import('./snapshot-stores.js');
    let release!: () => void;
    respond = () => new Promise((resolve) => { release = () => resolve(ok(SNAPSHOT)); });
    signedInThenReauthorized(); // catch-up in flight with tokenB
    _tokenStore.set(null); // sign-out while it is in flight
    release();
    await flush();
    expect(applyCatchUpSnapshot).not.toHaveBeenCalled();
  });

  it('a follow-up queued by a stopped runtime never fires into the next one', async () => {
    let release!: () => void;
    respond = () => new Promise((resolve) => { release = () => resolve(ok(SNAPSHOT)); });
    signedInThenReauthorized(); // catch-up in flight
    _onOpen?.(); // …and a follow-up queued behind it
    const releaseOld = release;
    await stopBridgeRuntime(); // e.g. <BridgeBootstrap> destroyed
    _tokenStore.set({ accessToken: tokenA });
    startBridgeRuntime(); // the next session on the same module state
    _onOpen?.(); // its initial connect — one catch-up of its own (TBP-686)
    releaseOld();
    await flush();
    await new Promise((r) => setTimeout(r, 0));
    // The old runtime's queued follow-up must NOT add a third: one for the
    // stopped runtime's in-flight call, one for the new runtime's own connect.
    expect(fetchCalls).toHaveLength(2);
  });

  // ── Quota catch-up (TBP-686) ─────────────────────────────────────────────
  //
  // Regression: a `quota.updated` push lost across a socket swap was never
  // repaired. `/session/init` carries no quota slice, and auth-core's
  // QuotaStore hydrates a metric exactly once (lazy `GET /usage/quota/:metric`
  // on first read) and thereafter only moves on live pushes — so one dropped
  // push freezes `used` for the rest of the session, silently. Seen on stage in
  // `metered-display` / `metered-plan-switch`, where a token refresh
  // reauthorized while the server was publishing.

  const QUOTA_URL = 'http://test/usage/quota/';
  const hydrated = (metric: string, used: number): QuotaSnap => ({
    metric,
    used,
    limit: 100,
    remaining: 100 - used,
  });
  // Answers the quota GET with `fresh` and the session GET with the snapshot.
  const answerQuotaWith = (fresh: QuotaSnap) => {
    respond = async (url) => (url.includes('/usage/quota/') ? ok(fresh) : ok(SNAPSHOT));
  };

  it('re-reads every hydrated quota metric on open and applies the answer to the store', async () => {
    _quotaStore.applyInitialSnapshot('ai_completions', hydrated('ai_completions', 10));
    _quotaApplied.length = 0; // that was the fixture's own hydration, not the runtime's
    answerQuotaWith(hydrated('ai_completions', 42));

    _tokenStore.set({ accessToken: tokenA });
    startBridgeRuntime();
    _onOpen?.();

    await vi.waitFor(() => expect(_quotaApplied).toHaveLength(1));
    // Alongside the session snapshot — not instead of it.
    expect(fetchCalls.map((c) => c.url).sort()).toEqual([
      'http://test/session/init',
      `${QUOTA_URL}ai_completions`,
    ]);
    const quotaCall = fetchCalls.find((c) => c.url.startsWith(QUOTA_URL))!;
    expect(quotaCall.headers.authorization).toBe(`Bearer ${tokenA}`);
    expect(quotaCall.headers['x-app-id']).toBe('app-1');
    // The REST answer reached auth-core's store: `used` is no longer frozen.
    expect(_quotaApplied[0]).toEqual({
      metric: 'ai_completions',
      snapshot: hydrated('ai_completions', 42),
    });
    expect(_quotaStore.getAll().get('ai_completions')).toMatchObject({ used: 42 });
  });

  // The cost gate. Every neighbouring test above asserts an exact fetch count
  // and `fetchCalls[0].url === 'http://test/session/init'`; an app that never
  // read a quota must stay at exactly that.
  it('an app that never read a quota issues no quota request at all', async () => {
    expect(_quotaStore.getAll().size).toBe(0);
    _tokenStore.set({ accessToken: tokenA });
    startBridgeRuntime();
    _onOpen?.();
    await flush();
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('http://test/session/init');
    expect(fetchCalls.some((c) => c.url.startsWith(QUOTA_URL))).toBe(false);
    expect(_quotaApplied).toEqual([]);
  });

  it('a live push that lands mid-flight wins — the REST answer is discarded', async () => {
    _quotaStore.applyInitialSnapshot('ai_completions', hydrated('ai_completions', 10));
    _quotaApplied.length = 0;
    let releaseQuota: (() => void) | undefined;
    respond = (url) =>
      url.includes('/usage/quota/')
        ? new Promise<Response>((resolve) => {
            releaseQuota = () => resolve(ok(hydrated('ai_completions', 42)));
          })
        : Promise.resolve(ok(SNAPSHOT));

    _tokenStore.set({ accessToken: tokenA });
    startBridgeRuntime();
    _onOpen?.();
    await vi.waitFor(() => expect(releaseQuota).toBeTypeOf('function'));

    // A `quota.updated` push lands while the GET is still out. It is NEWER
    // than the answer coming back, so the answer must not overwrite it.
    _quotaStore.applyQuotaUpdated(hydrated('ai_completions', 77));
    releaseQuota!();
    await flush();

    expect(_quotaApplied).toEqual([]);
    expect(_quotaStore.getAll().get('ai_completions')).toMatchObject({ used: 77 });
  });

  it('URL-encodes the metric name in the path', async () => {
    const metric = 'ai/completions v2';
    _quotaStore.applyInitialSnapshot(metric, hydrated(metric, 10));
    _quotaApplied.length = 0;
    answerQuotaWith(hydrated(metric, 42));

    _tokenStore.set({ accessToken: tokenA });
    startBridgeRuntime();
    _onOpen?.();

    await vi.waitFor(() => expect(_quotaApplied).toHaveLength(1));
    const quotaCall = fetchCalls.find((c) => c.url.startsWith(QUOTA_URL))!;
    expect(quotaCall.url).toBe(`${QUOTA_URL}ai%2Fcompletions%20v2`);
    expect(_quotaApplied[0].metric).toBe(metric);
  });
});
