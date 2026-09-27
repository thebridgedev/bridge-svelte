// TBP-703 — a backend's 402 QUOTA_EXCEEDED becomes an upgrade-dialog refusal,
// through the global fetch wrapper (page origin, Bridge API, billing.apiOrigins)
// and through bridgeFetch (any origin), exactly once, without touching the
// response the caller reads.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const { holder } = vi.hoisted(() => ({
  holder: { auth: null as unknown, config: {} as Record<string, unknown> },
}));

vi.mock('./bridge-instance.js', async () => {
  const { writable } = await import('svelte/store');
  return {
    tokenStore: writable(null),
    getBridgeAuth: () => {
      if (!holder.auth) throw new Error('Bridge not initialised');
      return holder.auth;
    },
  };
});

vi.mock('../client/stores/config.store.js', () => ({
  getConfig: () => holder.config,
}));

import {
  __resetQuotaRefusalForTests,
  dismissQuotaRefusal,
  observeQuotaRefusal,
  onBridgeQuotaExceeded,
  parseQuotaRefusal,
  quotaRefusal,
  safeFixPath,
  watchesQuotaOrigin,
  type BridgeQuotaRefusal,
} from './quota-refusal.js';
import { bridgeFetch, wrapFetchWithBridgeAuth } from './bridge-fetch.js';

const PAGE = 'https://app.example.test';
const API = 'https://api.bridge.test';

/** Exactly what bridge-nestjs@0.8.0-beta.0's @RequireQuota answers at the cap. */
const NEST_402 = {
  statusCode: 402,
  code: 'QUOTA_EXCEEDED',
  message: 'Your plan allows 3 tickets; 3 are in use.',
  metric: 'tickets',
  used: 3,
  limit: 3,
  fix: '/subscription',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Let the background clone-and-parse settle. */
const settle = () => new Promise((r) => setTimeout(r, 0));

let heard: BridgeQuotaRefusal[];
let off: () => void;

beforeEach(() => {
  __resetQuotaRefusalForTests();
  holder.auth = null;
  holder.config = {};
  vi.stubGlobal('location', { href: `${PAGE}/tickets`, origin: PAGE });
  heard = [];
  off = onBridgeQuotaExceeded((r) => heard.push(r));
});

afterEach(() => {
  off();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('parseQuotaRefusal', () => {
  it('reads the @RequireQuota body', () => {
    expect(parseQuotaRefusal(NEST_402, 'u')).toEqual({
      metric: 'tickets',
      used: 3,
      limit: 3,
      fix: '/subscription',
      message: 'Your plan allows 3 tickets; 3 are in use.',
      url: 'u',
    });
  });

  it('is not a quota refusal without code QUOTA_EXCEEDED or a metric', () => {
    expect(parseQuotaRefusal({ ...NEST_402, code: 'PAYMENT_REQUIRED' })).toBeNull();
    expect(parseQuotaRefusal({ ...NEST_402, metric: undefined })).toBeNull();
    expect(parseQuotaRefusal('Payment Required')).toBeNull();
    expect(parseQuotaRefusal(null)).toBeNull();
  });

  it('keeps missing numbers as null, never 0', () => {
    const r = parseQuotaRefusal({ code: 'QUOTA_EXCEEDED', metric: 'tickets' });
    expect(r?.used).toBeNull();
    expect(r?.limit).toBeNull();
  });
});

describe('safeFixPath — the backend’s fix becomes a link, so only a same-app path survives', () => {
  it.each(['/subscription', '/billing?from=tickets', '/subscription/plan#x'])('keeps %s', (p) => {
    expect(safeFixPath(p)).toBe(p);
  });
  it.each(['https://evil.test/pay', '//evil.test', '/\\evil.test', 'javascript:alert(1)', 'subscription', 7, null])(
    'drops %s',
    (p) => {
      expect(safeFixPath(p)).toBeNull();
    },
  );
});

describe('watchesQuotaOrigin', () => {
  const opts = { pageOrigin: PAGE, apiBaseUrl: API, apiOrigins: ['https://backend.example.test'] };
  it('watches the page origin (relative or absolute), Bridge’s API and listed origins', () => {
    expect(watchesQuotaOrigin('/api/tickets', opts)).toBe(true);
    expect(watchesQuotaOrigin(`${PAGE}/api/tickets`, opts)).toBe(true);
    expect(watchesQuotaOrigin(`${API}/usage/ingest`, opts)).toBe(true);
    expect(watchesQuotaOrigin('https://backend.example.test/tickets', opts)).toBe(true);
  });
  it('ignores any other origin', () => {
    expect(watchesQuotaOrigin('https://payments.example.test/charge', opts)).toBe(false);
  });
});

describe('observeQuotaRefusal', () => {
  it('announces a 402 refusal to listeners and the dialog store, and the caller can still read the body', async () => {
    const res = json(NEST_402, 402);
    await observeQuotaRefusal(res, `${PAGE}/api/tickets`);
    expect(heard).toHaveLength(1);
    expect(heard[0].metric).toBe('tickets');
    expect(get(quotaRefusal)?.metric).toBe('tickets');
    expect(await res.json()).toEqual(NEST_402);
  });

  it('ignores a non-402, and a 402 that is not a quota refusal', async () => {
    await observeQuotaRefusal(json(NEST_402, 403), '');
    await observeQuotaRefusal(json({ code: 'CARD_DECLINED' }, 402), '');
    await observeQuotaRefusal(new Response('Payment Required', { status: 402 }), '');
    expect(heard).toHaveLength(0);
    expect(get(quotaRefusal)).toBeNull();
  });

  it('announces one response once, however many paths see it', async () => {
    const res = json(NEST_402, 402);
    await observeQuotaRefusal(res);
    await observeQuotaRefusal(res);
    expect(heard).toHaveLength(1);
  });

  it('dismissQuotaRefusal closes the dialog', async () => {
    await observeQuotaRefusal(json(NEST_402, 402));
    dismissQuotaRefusal();
    expect(get(quotaRefusal)).toBeNull();
  });
});

describe('the global fetch wrapper — level 0 with plain fetch()', () => {
  it('a same-origin 402 QUOTA_EXCEEDED is announced, and returned to the caller unchanged', async () => {
    const base = vi.fn(async () => json(NEST_402, 402));
    const wrapped = wrapFetchWithBridgeAuth(base as unknown as typeof fetch, API);

    const res = await wrapped('/api/tickets', { method: 'POST' });
    await settle();

    expect(res.status).toBe(402);
    expect(await res.json()).toEqual(NEST_402);
    expect(heard.map((r) => [r.metric, r.url])).toEqual([['tickets', `${PAGE}/api/tickets`]]);
    // The app's own request gets no Bridge token from the wrapper.
    const init = (base.mock.calls[0] as unknown[])[1] as RequestInit | undefined;
    expect(new Headers(init?.headers).get('authorization')).toBeNull();
  });

  it('a 402 from Bridge’s own API is announced too', async () => {
    holder.auth = { getTokens: () => ({ accessToken: 't' }) };
    const wrapped = wrapFetchWithBridgeAuth((async () => json(NEST_402, 402)) as unknown as typeof fetch, API);
    await wrapped(`${API}/usage/ingest`);
    await settle();
    expect(heard).toHaveLength(1);
  });

  it('a 402 from a third-party origin is not the app’s plan limit', async () => {
    const wrapped = wrapFetchWithBridgeAuth((async () => json(NEST_402, 402)) as unknown as typeof fetch, API);
    await wrapped('https://payments.example.test/charge');
    await settle();
    expect(heard).toHaveLength(0);
  });

  it('a 402 from an origin listed in billing.apiOrigins is announced', async () => {
    holder.config = { billing: { apiOrigins: ['https://backend.example.test'] } };
    const wrapped = wrapFetchWithBridgeAuth((async () => json(NEST_402, 402)) as unknown as typeof fetch, API);
    await wrapped('https://backend.example.test/tickets');
    await settle();
    expect(heard).toHaveLength(1);
  });

  it('a 201 is not looked at', async () => {
    const res201 = json({ id: 1 }, 201);
    const clone = vi.spyOn(res201, 'clone');
    const wrapped = wrapFetchWithBridgeAuth((async () => res201) as unknown as typeof fetch, API);
    await wrapped('/api/tickets');
    await settle();
    expect(clone).not.toHaveBeenCalled();
    expect(heard).toHaveLength(0);
  });
});

describe('bridgeFetch — the app’s backend on any origin', () => {
  it('a cross-origin 402 QUOTA_EXCEEDED through bridgeFetch is announced (no apiOrigins needed)', async () => {
    holder.auth = { getTokens: () => ({ accessToken: 'user-tok' }), refreshTokens: async () => null };
    vi.stubGlobal('fetch', vi.fn(async () => json(NEST_402, 402)));

    const res = await bridgeFetch('https://backend.example.test/tickets', { method: 'POST' });
    await settle();

    expect(res.status).toBe(402);
    expect(await res.json()).toEqual(NEST_402);
    expect(heard.map((r) => r.url)).toEqual(['https://backend.example.test/tickets']);
  });

  it('bridgeFetch over the installed global wrapper announces a same-origin refusal once', async () => {
    holder.auth = { getTokens: () => ({ accessToken: 'user-tok' }), refreshTokens: async () => null };
    const wrapped = wrapFetchWithBridgeAuth((async () => json(NEST_402, 402)) as unknown as typeof fetch, API);
    vi.stubGlobal('fetch', wrapped);

    await bridgeFetch('/api/tickets', { method: 'POST' });
    await settle();

    expect(heard).toHaveLength(1);
  });

  it('works before Bridge is initialised', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(NEST_402, 402)));
    await bridgeFetch('/api/tickets');
    await settle();
    expect(heard).toHaveLength(1);
  });
});
