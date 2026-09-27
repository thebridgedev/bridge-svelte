// TBP-697 — `bridge.usage` (report a counter / set a gauge from the browser)
// and `bridgeFetch` (fetch to your own backend with the user's token).
//
// `bridge.usage` is driven against a real `BridgeAuth` whose `usage` getter
// builds the real auth-core UsageReporter, over a stubbed `fetch` — so the
// assertion is on the HTTP request Bridge receives, not on a delegate spy.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BridgeAuth } from '@nebulr-group/bridge-auth-core';

const { holder } = vi.hoisted(() => ({ holder: { auth: null as unknown } }));

vi.mock('./bridge-instance.js', async () => {
  const { writable } = await import('svelte/store');
  return {
    tokenStore: writable(null),
    subscriptionStore: writable({ status: null, plans: null, loading: false, error: null }),
    loadSubscription: async () => {},
    getBridgeAuth: () => {
      if (!holder.auth) throw new Error('Bridge not initialised');
      return holder.auth;
    },
  };
});

import { bridge } from './bridge.js';
import { bridgeFetch } from './bridge-fetch.js';

const API = 'https://api.example.test';
let fetchMock: ReturnType<typeof vi.fn>;

function ok(body: unknown = {}, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A real BridgeAuth, signed in with `token`. */
function realAuth(token: string): BridgeAuth {
  const auth = new BridgeAuth({ appId: 'app-1', apiBaseUrl: API, authBaseUrl: API, allowMultipleInstances: true } as never);
  // The usage reporter reads the token from BridgeAuth's token manager.
  const tm = (auth as unknown as { tokenManager: { getTokens: () => unknown } }).tokenManager;
  vi.spyOn(tm, 'getTokens').mockReturnValue({ accessToken: token });
  return auth;
}

beforeEach(() => {
  holder.auth = null;
  fetchMock = vi.fn(async () => ok());
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('bridge.usage — TBP-697', () => {
  it('set(metric, value) PUTs the absolute gauge value to Bridge with the user’s token', async () => {
    holder.auth = realAuth('user-tok');

    await bridge.usage.set('projects', 8);

    const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PUT');
    expect(put, 'no PUT reached fetch').toBeTruthy();
    const [url, init] = put as [string, RequestInit];
    expect(url).toBe(`${API}/usage/gauge/projects`);
    expect(JSON.parse(init.body as string)).toEqual({ value: 8 });
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer user-tok');
  });

  it('set() rejects when Bridge refuses the value, so the caller can tell it was not stored', async () => {
    holder.auth = realAuth('user-tok');
    fetchMock.mockResolvedValue(ok({ message: 'value must be >= 0' }, 400));
    await expect(bridge.usage.set('projects', -1)).rejects.toBeTruthy();
  });

  it('report(metric, value, key) queues a counter event that is sent to /usage/ingest', async () => {
    holder.auth = realAuth('user-tok');

    bridge.usage.report('ai_completions', 3, 'evt-1');

    await vi.waitFor(
      () => {
        const post = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/usage/ingest'));
        expect(post, 'no ingest POST yet').toBeTruthy();
      },
      { timeout: 4000, interval: 50 },
    );
    const [, init] = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/usage/ingest')) as [string, RequestInit];
    expect(init.body as string).toContain('ai_completions');
    expect(init.body as string).toContain('evt-1');
  });

  it('set() on an auth-core without gauges says what to upgrade, instead of "set is not a function"', async () => {
    holder.auth = { usage: { report: vi.fn(), getQueueStatus: vi.fn() } };
    await expect(bridge.usage.set('projects', 1)).rejects.toThrow(/bridge-auth-core 0\.8\.0-beta\.0 or later/);
  });
});

describe('bridgeFetch — TBP-697', () => {
  it('sends the user’s token to your backend and keeps the caller’s headers', async () => {
    holder.auth = { getTokens: () => ({ accessToken: 'tok-1' }), refreshTokens: vi.fn() };
    const res = await bridgeFetch('/api/projects', { method: 'POST', headers: { 'x-trace': 't1' }, body: '{}' });

    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/projects');
    const h = new Headers(init.headers);
    expect(h.get('Authorization')).toBe('Bearer tok-1');
    expect(h.get('x-trace')).toBe('t1');
    expect(init.method).toBe('POST');
  });

  it('on a 401 refreshes the token once and retries with the new one', async () => {
    const refreshTokens = vi.fn(async () => ({ accessToken: 'tok-2' }));
    holder.auth = { getTokens: () => ({ accessToken: 'tok-1' }), refreshTokens };
    fetchMock.mockResolvedValueOnce(ok({}, 401)).mockResolvedValueOnce(ok({ id: 1 }));

    const res = await bridgeFetch('/api/projects');

    expect(res.status).toBe(200);
    expect(refreshTokens).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers((fetchMock.mock.calls[1][1] as RequestInit).headers).get('Authorization')).toBe('Bearer tok-2');
  });

  it('a 401 the refresh cannot fix comes back as the 401 — no loop', async () => {
    holder.auth = { getTokens: () => ({ accessToken: 'tok-1' }), refreshTokens: vi.fn(async () => null) };
    fetchMock.mockResolvedValue(ok({}, 401));
    const res = await bridgeFetch('/api/projects');
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('signed out: no Authorization header, no refresh', async () => {
    const refreshTokens = vi.fn();
    holder.auth = { getTokens: () => null, refreshTokens };
    fetchMock.mockResolvedValue(ok({}, 401));
    await bridgeFetch('/api/public');
    expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).has('Authorization')).toBe(false);
    expect(refreshTokens).not.toHaveBeenCalled();
  });

  it('before Bridge is initialised it is plain fetch', async () => {
    await bridgeFetch('/api/x', { method: 'GET' });
    expect(fetchMock).toHaveBeenCalledWith('/api/x', { method: 'GET' });
  });
});
