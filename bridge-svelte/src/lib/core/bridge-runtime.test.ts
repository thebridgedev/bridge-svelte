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
let _onUserState: ((msg: { reason: string }) => Promise<void> | void) | undefined;

const _channelScopeCalls: Array<{ method: string; value: string | undefined }> = [];
const _reauthCalls: number[] = [];
let _startCalls = 0;
let _stopCalls = 0;
let _capturedRealtimeConfig: Record<string, unknown> | undefined;

// Reset the spy state between tests.
function resetSpies() {
  _onOpen = _onClose = _onSnapshot = _onUserState = undefined;
  _channelScopeCalls.length = 0;
  _reauthCalls.length = 0;
  _startCalls = 0;
  _stopCalls = 0;
  _capturedRealtimeConfig = undefined;
}

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('./bridge-instance.js', () => ({
  get tokenStore() {
    return _tokenStore;
  },
  getBridgeAuth: () => ({
    getApiContext: () => ({ appId: 'app-1', accessToken: null }),
    refreshTokens: async () => {},
  }),
}));

vi.mock('../client/stores/config.store.js', () => ({
  getConfig: () => ({ appId: 'app-1', apiBaseUrl: 'http://test' }),
}));

vi.mock('./snapshot-stores.js', () => ({
  applySessionSnapshot: vi.fn(),
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
    setOnUserState(fn: (msg: { reason: string }) => Promise<void> | void) { _onUserState = fn; }
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
      handle: vi.fn(() => () => {}),
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
} from './bridge-runtime.js';
import { realtimeStatus } from './realtime-status.js';

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
