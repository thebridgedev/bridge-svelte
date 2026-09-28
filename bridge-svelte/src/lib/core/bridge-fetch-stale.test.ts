// TBP-747 — a GraphQL TOKEN_VERSION_STALE answer must be retried with a token
// minted AFTER that answer, never with one from a refresh already in flight.
//
// Stage, 2026-09-28 (deploys #802-804): a brand-new user's first CreateApp in
// admin-ui failed twice with "access token has been invalidated; refresh
// required". The per-connect reconcile refresh had started before the
// server bumped tokenVersion 0 -> 1; the stale-answer path joined it, got a
// tv 0 token back and retried with it. The next refresh, 250 ms later,
// returned tv 1.
//
// The fake BridgeAuth models exactly that: a plain refreshTokens() joins the
// pre-bump refresh (tv 0); refreshTokens({ fresh: true }) mints after it (tv 1).

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { holder } = vi.hoisted(() => ({
  holder: { auth: null as unknown },
}));

vi.mock('./bridge-instance.js', async () => {
  const { writable } = await import('svelte/store');
  return {
    tokenStore: writable(null),
    getBridgeAuth: () => holder.auth,
  };
});

vi.mock('../client/stores/config.store.js', () => ({
  getConfig: () => ({}),
}));

import { wrapFetchWithBridgeAuth } from './bridge-fetch.js';

const API = 'https://api.example.test';
const SERVER_TV = 1;

const STALE_BODY = {
  errors: [
    {
      message: 'access token has been invalidated; refresh required',
      extensions: {
        code: 'UNAUTHENTICATED',
        response: { code: 'TOKEN_VERSION_STALE', error: 'invalid_token' },
      },
    },
  ],
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('bridge fetch wrapper — TOKEN_VERSION_STALE retry', () => {
  let current: string;
  let sentWith: string[];
  let refreshCalls: Array<{ fresh?: boolean } | undefined>;

  beforeEach(() => {
    current = 'tok-tv0';
    sentWith = [];
    refreshCalls = [];
    holder.auth = {
      getTokens: () => ({ accessToken: current }),
      refreshTokens: async (opts?: { fresh?: boolean }) => {
        refreshCalls.push(opts);
        // Joining the refresh that was in flight before the bump yields a
        // token at the OLD version; only a fresh mint sees the bump.
        current = opts?.fresh ? 'tok-tv1' : 'tok-tv0-reminted';
        return { accessToken: current };
      },
    };
  });

  const server = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const token = new Headers(init?.headers).get('Authorization')?.replace('Bearer ', '') ?? '';
    sentWith.push(token);
    const tv = token === 'tok-tv1' ? 1 : 0;
    return tv < SERVER_TV ? json(STALE_BODY) : json({ data: { createApp: { app: { id: 'app-new' } } } });
  };

  it('retries a stale answer with a token minted after it, and the retry succeeds', async () => {
    const wrapped = wrapFetchWithBridgeAuth(server as unknown as typeof fetch, API);

    const res = await wrapped(`${API}/graphql`, { method: 'POST', body: '{}' });
    const body = await res.json();

    expect(body).toEqual({ data: { createApp: { app: { id: 'app-new' } } } });
    expect(sentWith).toEqual(['tok-tv0', 'tok-tv1']);
    expect(refreshCalls).toEqual([{ fresh: true }]);
  });

  it('passes a non-stale answer through without refreshing', async () => {
    current = 'tok-tv1';
    const wrapped = wrapFetchWithBridgeAuth(server as unknown as typeof fetch, API);

    const res = await wrapped(`${API}/graphql`, { method: 'POST', body: '{}' });

    expect((await res.json()).data.createApp.app.id).toBe('app-new');
    expect(refreshCalls).toEqual([]);
    expect(sentWith).toEqual(['tok-tv1']);
  });
});
