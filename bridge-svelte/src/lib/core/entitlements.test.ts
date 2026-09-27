// TBP-697 — the `entitlements` store: `$entitlements.can(key)` from the Svelte
// plugin alone, with `ready` telling "not loaded yet" apart from "this plan
// cannot". Drives the real session-snapshot stores and a real auth-core
// EntitlementsStore — the two places a live entitlement map arrives.

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

import {
  __resetSnapshotStores,
  applyEntitlementsChanged,
  applySessionSnapshot,
  type SessionSnapshotData,
} from './snapshot-stores.js';
import { entitlements } from './entitlements.js';

const signedIn = { accessToken: 'a.b.c', refreshToken: 'r', idToken: 'i' } as unknown as TokenSet;

function snapshot(map: Record<string, boolean>): SessionSnapshotData {
  return {
    app: { branding: { logo: '', name: 'Acme' } },
    tenant: { id: 'ws', name: 'WS', subscription: { plan: { slug: 'pro', name: 'Pro' }, status: 'active' }, entitlements: map },
    user: { id: 'u', role: 'owner', tenantId: 'ws' },
  };
}

beforeEach(() => {
  coreStore = new EntitlementsStore();
  tokens.current.set(null);
  __resetSnapshotStores();
});

afterEach(() => {
  __resetSnapshotStores();
});

describe('entitlements store — TBP-697', () => {
  it('signed in but nothing loaded: not ready, and can() is false — distinguishable from a denial', () => {
    tokens.current.set(signedIn);
    const e = get(entitlements);
    expect(e.ready).toBe(false);
    expect(e.can('ai_completions')).toBe(false);
    expect(e.all).toEqual({});
  });

  it('the session snapshot makes it ready: granted keys true, denied and unknown keys false', () => {
    tokens.current.set(signedIn);
    applySessionSnapshot(snapshot({ ai_completions: true, sso: false }));
    const e = get(entitlements);
    expect(e.ready).toBe(true);
    expect(e.can('ai_completions')).toBe(true);
    expect(e.can('sso')).toBe(false);
    expect(e.can('not_on_any_plan')).toBe(false);
    expect(e.all).toEqual({ ai_completions: true, sso: false });
  });

  it('an entitlements.changed push replaces the map, and subscribers see it', () => {
    tokens.current.set(signedIn);
    applySessionSnapshot(snapshot({ ai_completions: true }));
    const seen: boolean[] = [];
    const off = entitlements.subscribe((e) => seen.push(e.can('ai_completions')));
    applyEntitlementsChanged({ entitlements: { ai_completions: false } });
    off();
    expect(seen).toEqual([true, false]);
  });

  it('before the first snapshot, auth-core’s own cache answers once it has one', () => {
    tokens.current.set(signedIn);
    const seen: boolean[] = [];
    const off = entitlements.subscribe((e) => seen.push(e.ready));
    coreStore.applyEntitlementsChanged({ exports: true });
    expect(get(entitlements).can('exports')).toBe(true);
    off();
    expect(seen).toEqual([false, true]);
  });

  it('signing out empties it', () => {
    tokens.current.set(signedIn);
    applySessionSnapshot(snapshot({ ai_completions: true }));
    expect(get(entitlements).can('ai_completions')).toBe(true);
    tokens.current.set(null);
    const e = get(entitlements);
    expect(e.ready).toBe(false);
    expect(e.can('ai_completions')).toBe(false);
  });
});
