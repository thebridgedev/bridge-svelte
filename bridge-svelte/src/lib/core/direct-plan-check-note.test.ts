// TBP-705 — a direct plan-feature check (<Entitled to>, $entitlements.can) is the
// documented exception; the standard gate is a flag ruled
// `bridge:billing.entitlement.<key> eq true`. In development the first direct
// check on a page logs one info note pointing at `bridge-cli check gates`; in
// production nothing is printed.
//
// Drives the real <Entitled> component (svelte/server) and the real
// `entitlements` store — the two public entry points — not the note helper alone.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get, type Writable } from 'svelte/store';
import { EntitlementsStore, type TokenSet } from '@nebulr-group/bridge-auth-core';

let coreStore: EntitlementsStore;
const { tokens } = vi.hoisted(() => ({ tokens: { current: null as unknown as Writable<TokenSet | null> } }));

vi.mock('@nebulr-group/bridge-auth-core', async (importOriginal) => {
  const real = await importOriginal<typeof import('@nebulr-group/bridge-auth-core')>();
  return { ...real, useBridge: () => ({ entitlementsStore: coreStore }) };
});
vi.mock('./bridge-instance.js', async () => {
  const { writable: w } = await import('svelte/store');
  tokens.current = w<TokenSet | null>(null);
  return { tokenStore: tokens.current };
});

import { render as ssr } from 'svelte/server';
import { __resetSnapshotStores, applySessionSnapshot, type SessionSnapshotData } from './snapshot-stores.js';
import { entitlements } from './entitlements.js';
import { __resetDirectPlanCheckNote } from './direct-plan-check-note.js';
import EntitledFixture from '../client/components/subscription/EntitledFixture.test.svelte';

const signedIn = { accessToken: 'a.b.c', refreshToken: 'r', idToken: 'i' } as unknown as TokenSet;

function snapshot(map: Record<string, boolean>): SessionSnapshotData {
  return {
    app: { branding: { logo: '', name: 'Acme' } },
    tenant: { id: 'ws', name: 'WS', subscription: { plan: { slug: 'pro', name: 'Pro' }, status: 'active' }, entitlements: map },
    user: { id: 'u', role: 'owner', tenantId: 'ws' },
  };
}

/** Render <Entitled to={key}>. svelte/server renders lazily: reading `.body` is what runs it. */
function renderEntitled(key: string): string {
  return ssr(EntitledFixture as never, { props: { to: key } } as never).body;
}

let info: { mock: { calls: unknown[][] }; mockRestore(): void };

/** The [bridge] direct-plan-check notes printed so far. */
function notes(): string[] {
  return info.mock.calls.map((c: unknown[]) => String(c[0])).filter((m: string) => m.includes('checks the plan directly'));
}

beforeEach(() => {
  coreStore = new EntitlementsStore();
  __resetSnapshotStores();
  __resetDirectPlanCheckNote();
  tokens.current.set(signedIn);
  applySessionSnapshot(snapshot({ analytics: true }));
  info = vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  info.mockRestore();
  vi.unstubAllEnvs();
  __resetSnapshotStores();
});

describe('direct plan-check note — TBP-705', () => {
  it('<Entitled to="analytics"> in development: one note naming the flag rule and the check command', () => {
    vi.stubEnv('DEV', true);
    renderEntitled('analytics');
    expect(notes()).toEqual([
      expect.stringContaining('[bridge] <Entitled to="analytics"> checks the plan directly.'),
    ]);
    expect(notes()[0]).toContain('bridge:billing.entitlement.analytics');
    expect(notes()[0]).toContain('npx @nebulr-group/bridge-cli check gates');
  });

  it('logs once per page load, however many times and however it is checked', () => {
    vi.stubEnv('DEV', true);
    renderEntitled('analytics');
    renderEntitled('sso');
    const e = get(entitlements);
    e.can('analytics');
    e.can('reports');
    expect(notes()).toHaveLength(1);
  });

  it("$entitlements.can('analytics') in development: one note in the script form, and the answer is unchanged", () => {
    vi.stubEnv('DEV', true);
    const e = get(entitlements);
    expect(e.can('analytics')).toBe(true);
    expect(e.can('sso')).toBe(false);
    expect(notes()).toEqual([expect.stringContaining("[bridge] $entitlements.can('analytics') checks the plan directly.")]);
  });

  it('production build: silent for both forms', () => {
    vi.stubEnv('DEV', false);
    renderEntitled('analytics');
    get(entitlements).can('analytics');
    expect(notes()).toHaveLength(0);
  });
});
