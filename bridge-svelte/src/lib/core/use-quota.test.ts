// TBP-697 — useQuota(metric): quota numbers from the Svelte plugin alone.
//
// Drives the REAL auth-core QuotaStore (the cache <BridgeQuotaBanner> reads)
// over a stubbed `fetch`, so what is proved is the whole read path: first read
// → GET /usage/quota/:metric → numbers; a push → new numbers; "no quota on this
// plan" → unlimited. The vitest environment is node, where Svelte's reactive
// subscriber is inert, so every read here is a fresh point-in-time read — the
// live re-render is covered by the demo's Playwright spec.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writable } from 'svelte/store';
import { QuotaStore } from '@nebulr-group/bridge-auth-core';

let store: QuotaStore;

vi.mock('@nebulr-group/bridge-auth-core', async (importOriginal) => {
  const real = await importOriginal<typeof import('@nebulr-group/bridge-auth-core')>();
  return { ...real, useBridge: () => ({ quotas: store }) };
});
vi.mock('./bridge-instance.js', () => ({ tokenStore: writable(null) }));

import { useQuota } from './use-quota.js';

const API = 'https://api.example.test';

type Reply = { status: number; body: unknown } | 'hang' | 'reject';
let replies: Reply[];
let fetchMock: ReturnType<typeof vi.fn>;

function configure(token: string | null = 'tok'): void {
  store.configure({ apiBaseUrl: API, accessToken: token, appId: 'app-1' });
}

/** Let the store's async hydrate settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  store = new QuotaStore();
  replies = [];
  fetchMock = vi.fn(async () => {
    const next = replies.shift() ?? { status: 200, body: null };
    if (next === 'hang') return new Promise(() => {});
    if (next === 'reject') throw new Error('network down');
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const gaugeBody = {
  metric: 'projects',
  used: 8,
  limit: 10,
  remaining: 2,
  warningLevel: 'approaching',
  policy: 'hard',
  kind: 'gauge',
};

describe('useQuota(metric) — TBP-697', () => {
  it('is loading with no numbers — not zeros — until Bridge answers, then shows the real ones', async () => {
    configure();
    replies.push({ status: 200, body: gaugeBody });
    const q = useQuota('projects');

    expect(q.loading).toBe(true);
    expect(q.used).toBeNull();
    expect(q.limit).toBeNull();
    expect(q.remaining).toBeNull();
    expect(q.kind).toBeNull();
    expect(q.unlimited).toBe(false);

    // The first read asked the server, with the user's token.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/usage/quota/projects`);
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok');

    await settle();

    expect(q.loading).toBe(false);
    expect(q.used).toBe(8);
    expect(q.limit).toBe(10);
    expect(q.remaining).toBe(2);
    expect(q.warningLevel).toBe('approaching');
    expect(q.kind).toBe('gauge');
    expect(q.snapshot?.policy).toBe('hard');
  });

  it('a live quota.updated push moves the numbers', async () => {
    configure();
    replies.push({ status: 200, body: gaugeBody });
    const q = useQuota('projects');
    q.used;
    await settle();
    expect(q.used).toBe(8);

    store.applyQuotaUpdated({
      kind: 'quota.updated',
      tenantId: 'ws-1',
      effectiveAt: new Date().toISOString(),
      metric: 'projects',
      used: 10,
      limit: 10,
      remaining: 0,
      warningLevel: 'critical',
      policy: 'hard',
      quotaKind: 'gauge',
    });

    expect(q.used).toBe(10);
    expect(q.remaining).toBe(0);
    expect(q.warningLevel).toBe('critical');
    expect(q.kind).toBe('gauge');
  });

  it('a server that predates gauges sends no kind: the quota reads as a counter', async () => {
    configure();
    const { kind: _drop, ...counterBody } = gaugeBody;
    replies.push({ status: 200, body: { ...counterBody, metric: 'ai_completions', used: 40, limit: 100, remaining: 60 } });
    const q = useQuota('ai_completions');
    q.used;
    await settle();
    expect(q.kind).toBe('counter');
    expect(q.used).toBe(40);
  });

  it('"no quota on this plan" is unlimited — answered, not loading — and is not refetched on every read', async () => {
    configure();
    replies.push({ status: 200, body: null });
    const q = useQuota('exports');
    q.loading;
    await settle();

    expect(q.loading).toBe(false);
    expect(q.unlimited).toBe(true);
    expect(q.used).toBeNull();
    expect(q.limit).toBeNull();

    // A component re-renders on the store's notification and reads again. The
    // store keeps no record of a null answer, so without the guard each read
    // would fetch again — one GET per render, for as long as the page is open.
    for (let i = 0; i < 5; i++) {
      q.unlimited;
      q.used;
    }
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('before sign-in it waits (no request, no numbers); the first read after sign-in fetches', async () => {
    configure(null);
    replies.push({ status: 200, body: gaugeBody });
    const q = useQuota('projects');

    expect(q.loading).toBe(true);
    expect(q.used).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    configure('tok');
    q.loading;
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(q.used).toBe(8);
  });

  it('a failed read stays loading — it never falls back to 0', async () => {
    configure();
    replies.push('reject');
    const q = useQuota('projects');
    q.loading;
    await settle();

    expect(q.loading).toBe(true);
    expect(q.used).toBeNull();
    expect(q.unlimited).toBe(false);
  });

  it('takes a getter, so a reactive metric key is read on each access', async () => {
    configure();
    replies.push({ status: 200, body: gaugeBody });
    replies.push({ status: 200, body: { ...gaugeBody, metric: 'users', used: 3, limit: 5, remaining: 2 } });
    let metric = 'projects';
    const q = useQuota(() => metric);
    q.used;
    await settle();
    expect(q.used).toBe(8);

    metric = 'users';
    expect(q.loading).toBe(true);
    await settle();
    expect(q.used).toBe(3);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      `${API}/usage/quota/projects`,
      `${API}/usage/quota/users`,
    ]);
  });
});
