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
import { bridgeFetch, wrapFetchWithBridgeAuth } from './bridge-fetch.js';
import { __resetDoubleCountWarning } from './double-count-warning.js';

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

// TBP-697 — in development the plugin warns when the browser and the backend
// both count the same metric. The backend side is the real header
// bridge-nestjs sends outside production; the browser side is the real
// `bridge.usage` surface.
describe('double-count warning (dev only) — TBP-697', () => {
  const counted = (metrics: string) =>
    new Response('{}', { status: 201, headers: { 'content-type': 'application/json', 'X-Bridge-Usage-Counted': metrics } });
  let warn: ReturnType<typeof vi.spyOn>;
  const doubleCountWarnings = () =>
    warn.mock.calls.filter((c: unknown[]) => String(c[0]).includes('counted twice'));

  beforeEach(() => {
    __resetDoubleCountWarning();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    holder.auth = realAuth('user-tok');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('backend counted `tickets` (bridgeFetch) and the page reports it too → one warning naming the metric', async () => {
    fetchMock.mockResolvedValueOnce(counted('tickets'));
    await bridgeFetch('/api/tickets', { method: 'POST' });
    expect(doubleCountWarnings()).toHaveLength(0);

    bridge.usage.report('tickets');
    expect(doubleCountWarnings()).toHaveLength(1);
    expect(doubleCountWarnings()[0][0]).toContain("'tickets'");

    // Once per metric: a second round does not repeat it.
    fetchMock.mockResolvedValueOnce(counted('tickets'));
    await bridgeFetch('/api/tickets', { method: 'POST' });
    bridge.usage.report('tickets');
    expect(doubleCountWarnings()).toHaveLength(1);
  });

  it('either order: the page reports first (set), then the backend says it counts it', async () => {
    // Whether or not the installed auth-core stores gauges, the call is the
    // page counting `projects`.
    await bridge.usage.set('projects', 3).catch(() => {});
    expect(doubleCountWarnings()).toHaveLength(0);
    fetchMock.mockResolvedValueOnce(counted('exports, projects'));
    await bridgeFetch('/api/projects', { method: 'POST' });
    expect(doubleCountWarnings()).toHaveLength(1);
    expect(doubleCountWarnings()[0][0]).toContain("'projects'");
  });

  it('a plain fetch to the app backend (the installed fetch wrapper) is noticed too, and a 402 refusal counts', async () => {
    const base = vi.fn(async () =>
      new Response('{}', { status: 402, headers: { 'X-Bridge-Usage-Counted': 'tickets' } }),
    );
    const wrapped = wrapFetchWithBridgeAuth(base as unknown as typeof fetch, API);
    await wrapped('https://app.example.test/api/tickets', { method: 'POST' });
    bridge.usage.report('tickets');
    expect(doubleCountWarnings()).toHaveLength(1);
  });

  it('different metrics on each side → no warning', async () => {
    fetchMock.mockResolvedValueOnce(counted('tickets'));
    await bridgeFetch('/api/tickets', { method: 'POST' });
    bridge.usage.report('ai_completions');
    expect(doubleCountWarnings()).toHaveLength(0);
  });

  it('browser-only counting (no header from any backend) is first-class → no warning', async () => {
    fetchMock.mockResolvedValueOnce(ok());
    await bridgeFetch('/api/drafts', { method: 'POST' });
    bridge.usage.report('drafts');
    expect(doubleCountWarnings()).toHaveLength(0);
  });

  it('production build: silent, even when both sides count the same metric', async () => {
    vi.stubEnv('DEV', false);
    fetchMock.mockResolvedValueOnce(counted('tickets'));
    await bridgeFetch('/api/tickets', { method: 'POST' });
    bridge.usage.report('tickets');
    expect(doubleCountWarnings()).toHaveLength(0);
  });
});
