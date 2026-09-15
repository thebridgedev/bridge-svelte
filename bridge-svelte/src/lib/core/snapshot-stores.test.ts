// TBP-660 — the reconnect catch-up applies a REST session snapshot and has to
// know whether it repaired anything, so the runtime re-runs the route guard
// only when a lost push actually moved the plan or the entitlements.

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  __resetSnapshotStores,
  applyCatchUpSnapshot,
  applySubscriptionPlanChanged,
  tenantEntitlementsStore,
  tenantSubscriptionStore,
  type SessionSnapshotData,
} from './snapshot-stores.js';

const snapshot = (slug: string, entitlements: Record<string, boolean>, status = 'active'): SessionSnapshotData => ({
  app: { branding: { logo: '', name: 'App' } },
  tenant: {
    id: 'ws-1',
    name: 'Workspace',
    subscription: { plan: { slug, name: slug.toUpperCase() }, status },
    entitlements,
  },
  user: { id: 'user-1', role: 'OWNER', tenantId: 'ws-1' },
});

beforeEach(() => {
  __resetSnapshotStores();
});

describe('applyCatchUpSnapshot (TBP-660)', () => {
  it('writes the snapshot to the bridge.tenant stores', () => {
    applyCatchUpSnapshot(snapshot('pro', { pro_page: true }));
    expect(get(tenantSubscriptionStore)?.plan.slug).toBe('pro');
    expect(get(tenantEntitlementsStore)).toEqual({ pro_page: true });
  });

  it('reports a plan change the stores missed, and moves them', () => {
    applyCatchUpSnapshot(snapshot('free', { pro_page: false }));
    expect(applyCatchUpSnapshot(snapshot('pro', { pro_page: false }))).toEqual({
      planChanged: true,
      entitlementsChanged: false,
    });
    expect(get(tenantSubscriptionStore)?.plan.slug).toBe('pro');
  });

  it('a status-only change counts as a plan change (e.g. trial → active)', () => {
    applyCatchUpSnapshot(snapshot('pro', {}, 'trial'));
    expect(applyCatchUpSnapshot(snapshot('pro', {}, 'active')).planChanged).toBe(true);
  });

  it('reports nothing when the push did arrive and the stores already agree', () => {
    applyCatchUpSnapshot(snapshot('free', { pro_page: false }));
    applySubscriptionPlanChanged({ to: { slug: 'pro', name: 'PRO' }, status: 'active' });
    expect(applyCatchUpSnapshot(snapshot('pro', { pro_page: false }))).toEqual({
      planChanged: false,
      entitlementsChanged: false,
    });
  });

  it('compares entitlements key by key, not by reference', () => {
    applyCatchUpSnapshot(snapshot('pro', { a: true, b: false }));
    expect(applyCatchUpSnapshot(snapshot('pro', { b: false, a: true })).entitlementsChanged).toBe(false);
    expect(applyCatchUpSnapshot(snapshot('pro', { a: true, b: true })).entitlementsChanged).toBe(true);
    expect(applyCatchUpSnapshot(snapshot('pro', { a: true })).entitlementsChanged).toBe(true);
  });

  it('first catch-up into empty stores reports both as changed', () => {
    expect(applyCatchUpSnapshot(snapshot('free', {}))).toEqual({ planChanged: true, entitlementsChanged: true });
  });
});
