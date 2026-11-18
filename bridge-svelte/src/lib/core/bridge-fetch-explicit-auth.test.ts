// TBP-896 — the Bridge fetch wrapper injects the session token only when the
// caller sent no credential of its own. Stage 2026-11-02: a valid
// service-account token sent to the MCP endpoint from an app page arrived as
// the signed-in user's session token and was refused (401).
import { describe, expect, it, vi } from 'vitest';

const { holder } = vi.hoisted(() => ({ holder: { auth: null as unknown } }));

vi.mock('./bridge-instance.js', async () => {
  const { writable } = await import('svelte/store');
  return { tokenStore: writable(null), getBridgeAuth: () => holder.auth };
});
vi.mock('../client/stores/config.store.js', () => ({ getConfig: () => ({}) }));

import { wrapFetchWithBridgeAuth } from './bridge-fetch.js';

const API = 'https://api.example.test';

function setup() {
  holder.auth = { getTokens: () => ({ accessToken: 'session-token' }), refreshTokens: vi.fn() };
  const seen: Array<string | null> = [];
  const base = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const fromInit = init?.headers ? new Headers(init.headers).get('Authorization') : null;
    const fromRequest = input instanceof Request ? input.headers.get('Authorization') : null;
    seen.push(fromInit ?? fromRequest);
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fetch: wrapFetchWithBridgeAuth(base, API), seen };
}

describe('bridge fetch wrapper — explicit Authorization (TBP-896)', () => {
  it('keeps a caller-supplied Authorization header', async () => {
    const { fetch, seen } = setup();
    await fetch(`${API}/mcp`, { method: 'POST', headers: { Authorization: 'Bearer service-token' } });
    expect(seen).toEqual(['Bearer service-token']);
  });

  it('keeps it on a Request object too', async () => {
    const { fetch, seen } = setup();
    await fetch(new Request(`${API}/mcp`, { method: 'POST', headers: { authorization: 'Bearer service-token' } }));
    expect(seen).toEqual(['Bearer service-token']);
  });

  it('still injects the session token when the caller sent none', async () => {
    const { fetch, seen } = setup();
    await fetch(`${API}/graphql`, { method: 'POST', headers: { 'content-type': 'application/json' } });
    expect(seen).toEqual(['Bearer session-token']);
  });
});
