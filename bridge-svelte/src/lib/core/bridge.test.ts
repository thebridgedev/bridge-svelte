// Phase 4 (TBP-288/319) — bridge surface + session.snapshot wiring tests.
//
// Verifies:
//   1. Identity stability — the `bridge` object reference never changes
//      across snapshot updates (so consumers can destructure freely).
//   2. Slice stores are `null` initially and become populated atomically
//      after `applySessionSnapshot()` is called with a full payload.
//   3. Partial server payloads leave existing fields in place instead of
//      clobbering them with `null` (defensive against schema evolution).
//   4. `bridge.tenant.entitlements.can(key)` answers synchronously from the
//      latest entitlement map (NOT from a store subscription).
//   5. Reconnect re-emit (calling applySessionSnapshot again) overwrites
//      previous values wholesale.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  applySessionSnapshot,
  __resetSnapshotStores,
  type SessionSnapshotData,
} from './snapshot-stores.js';
import { bridge, _allSnapshotSlices, __resetBridgeLazySlices } from './bridge.js';

const fullSnapshot: SessionSnapshotData = {
  app: {
    branding: { logo: 'logo.png', name: 'Acme', primaryButtonBgColor: '#000' },
  },
  tenant: {
    id: 'ws-1',
    name: 'My Workspace',
    subscription: { plan: { slug: 'pro', name: 'Pro' }, status: 'active' },
    entitlements: { app_active: true, ai_completions: true },
  },
  user: { id: 'u-1', email: 'u@ex.com', role: 'owner', tenantId: 'ws-1' },
};

afterEach(() => {
  __resetSnapshotStores();
  __resetBridgeLazySlices();
});

// Stub the bridge-instance singleton so bridge.app.plans.load() doesn't
// require a real BridgeAuth in vitest. The actual load impl reads from
// getBridgeAuth() which throws when uninitialized.
vi.mock('./bridge-instance.js', () => ({
  getBridgeAuth: () => ({
    getPlans: async () => [
      { key: 'free', name: 'Free' },
      { key: 'pro', name: 'Pro' },
    ],
  }),
}));

describe('bridge surface (Phase 4, TBP-319)', () => {
  it('initial slice stores are null until a snapshot lands', () => {
    expect(get(bridge.app.branding)).toBeNull();
    expect(get(bridge.tenant.id)).toBeNull();
    expect(get(bridge.tenant.name)).toBeNull();
    expect(get(bridge.tenant.subscription)).toBeNull();
    expect(get(bridge.tenant.entitlements.snapshot)).toBeNull();
    expect(get(bridge.user)).toBeNull();
  });

  it('applies a full snapshot atomically — every slice updates together', () => {
    const observed: Array<ReturnType<typeof get<typeof _allSnapshotSlices>>> = [];
    const unsub = _allSnapshotSlices.subscribe((v) => observed.push(v));
    applySessionSnapshot(fullSnapshot);
    unsub();

    // First observation is the initial all-null state; subsequent observations
    // arrive as Svelte fires per-source updates. We don't assert a specific
    // count (depends on Svelte's batching), but the final state must be the
    // full snapshot.
    const final = observed[observed.length - 1];
    expect(final.branding).toEqual(fullSnapshot.app.branding);
    expect(final.tenantId).toBe('ws-1');
    expect(final.tenantName).toBe('My Workspace');
    expect(final.subscription).toEqual(fullSnapshot.tenant.subscription);
    expect(final.entitlements).toEqual(fullSnapshot.tenant.entitlements);
    expect(final.user).toEqual(fullSnapshot.user);
  });

  it('populates each individual slice store correctly', () => {
    applySessionSnapshot(fullSnapshot);
    expect(get(bridge.app.branding)).toEqual(fullSnapshot.app.branding);
    expect(get(bridge.tenant.id)).toBe('ws-1');
    expect(get(bridge.tenant.name)).toBe('My Workspace');
    expect(get(bridge.tenant.subscription)).toEqual(fullSnapshot.tenant.subscription);
    expect(get(bridge.tenant.entitlements.snapshot)).toEqual(fullSnapshot.tenant.entitlements);
    expect(get(bridge.user)).toEqual(fullSnapshot.user);
  });

  it('bridge.tenant.entitlements.can() answers from the latest snapshot', () => {
    applySessionSnapshot(fullSnapshot);
    expect(bridge.tenant.entitlements.can('app_active')).toBe(true);
    expect(bridge.tenant.entitlements.can('ai_completions')).toBe(true);
    expect(bridge.tenant.entitlements.can('not_in_map')).toBe(false);
  });

  it('can() reflects updates after a second snapshot (reconnect re-emit)', () => {
    applySessionSnapshot(fullSnapshot);
    expect(bridge.tenant.entitlements.can('ai_completions')).toBe(true);

    applySessionSnapshot({
      ...fullSnapshot,
      tenant: {
        ...fullSnapshot.tenant,
        entitlements: { app_active: false, ai_completions: false },
      },
    });
    expect(bridge.tenant.entitlements.can('app_active')).toBe(false);
    expect(bridge.tenant.entitlements.can('ai_completions')).toBe(false);
  });

  it('reconnect re-emit overwrites every slice wholesale', () => {
    applySessionSnapshot(fullSnapshot);
    const second: SessionSnapshotData = {
      app: { branding: { logo: 'logo2.png', name: 'Beta' } },
      tenant: {
        id: 'ws-2',
        name: 'Other Workspace',
        subscription: { plan: { slug: 'free', name: 'Free' }, status: 'trial', endsAt: '2026-12-31' },
        entitlements: { app_active: true },
      },
      user: { id: 'u-2', role: 'member', tenantId: 'ws-2' },
    };
    applySessionSnapshot(second);
    expect(get(bridge.tenant.id)).toBe('ws-2');
    expect(get(bridge.tenant.name)).toBe('Other Workspace');
    expect(get(bridge.tenant.subscription)).toEqual(second.tenant.subscription);
    expect(get(bridge.app.branding)).toEqual(second.app.branding);
    expect(get(bridge.user)).toEqual(second.user);
  });

  it('partial server payload leaves missing fields untouched (defensive)', () => {
    applySessionSnapshot(fullSnapshot);
    // Server omits tenant.entitlements + app.branding; existing values must
    // stick instead of getting nulled out.
    applySessionSnapshot({
      app: {} as any,
      tenant: {
        id: 'ws-1',
        name: 'My Workspace',
        // subscription + entitlements intentionally omitted
      } as any,
      user: fullSnapshot.user,
    });
    expect(get(bridge.app.branding)).toEqual(fullSnapshot.app.branding);
    expect(get(bridge.tenant.subscription)).toEqual(fullSnapshot.tenant.subscription);
    expect(get(bridge.tenant.entitlements.snapshot)).toEqual(
      fullSnapshot.tenant.entitlements,
    );
  });

  it('bridge object identity is stable across snapshot updates', () => {
    const ref1 = bridge;
    const appRef1 = bridge.app;
    const tenantRef1 = bridge.tenant;
    applySessionSnapshot(fullSnapshot);
    expect(bridge).toBe(ref1);
    expect(bridge.app).toBe(appRef1);
    expect(bridge.tenant).toBe(tenantRef1);
    applySessionSnapshot({ ...fullSnapshot, tenant: { ...fullSnapshot.tenant, id: 'ws-2' } });
    expect(bridge).toBe(ref1);
  });

  it('does not throw on malformed input', () => {
    expect(() => applySessionSnapshot(null as any)).not.toThrow();
    expect(() => applySessionSnapshot(undefined as any)).not.toThrow();
    expect(() => applySessionSnapshot({} as any)).not.toThrow();
  });
});

describe('bridge.attributes (Phase 5, TBP-328)', () => {
  it('exposes set/bind/bindMany/get backed by DevAttributeProvider', () => {
    bridge.attributes.clear();
    bridge.attributes.set('cohort', 'A');
    expect(bridge.attributes.get()).toEqual({ cohort: 'A' });
    bridge.attributes.bind('seq', () => 7);
    expect(bridge.attributes.get()).toEqual({ cohort: 'A', seq: 7 });
    bridge.attributes.bindMany(() => ({ extra: true }));
    expect(bridge.attributes.get()).toEqual({ cohort: 'A', seq: 7, extra: true });
    bridge.attributes.clear();
  });

  it('reserved bridge: namespace is rejected at the bridge surface too', () => {
    bridge.attributes.clear();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    bridge.attributes.set('bridge:plan', 'nope');
    expect(bridge.attributes.get()).toEqual({});
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe('bridge.events (Phase 5, TBP-331)', () => {
  it('handle() returns an unsubscribe; specific handler fires on dispatch', () => {
    bridge.events._resetForTests();
    const fn = vi.fn();
    const unsub = bridge.events.handle({ 'flag.updated': fn });
    bridge.events._dispatch({ kind: 'flag.updated', flag: { key: 'x' } } as any);
    expect(fn).toHaveBeenCalledOnce();
    unsub();
    bridge.events._dispatch({ kind: 'flag.updated', flag: { key: 'y' } } as any);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('fallback handler fires only when no specific handler is registered', () => {
    bridge.events._resetForTests();
    const fb = vi.fn();
    bridge.events.handle({ '*': fb });
    bridge.events._dispatch({ kind: 'session.snapshot', data: {} } as any);
    expect(fb).toHaveBeenCalledOnce();
  });
});

describe('bridge.app.plans lazy slice (Phase 4, TBP-321/322)', () => {
  it('initial value is null until .load()', () => {
    expect(get(bridge.app.plans)).toBeNull();
    expect(bridge.app.plans.isLoaded).toBe(false);
  });

  it('.load() resolves with plans from the auth client', async () => {
    const plans = await bridge.app.plans.load();
    expect(plans).toEqual([
      { key: 'free', name: 'Free' },
      { key: 'pro', name: 'Pro' },
    ]);
    expect(bridge.app.plans.isLoaded).toBe(true);
  });

  it('thenable: `await bridge.app.plans` triggers load', async () => {
    const plans = await bridge.app.plans;
    expect(plans).toHaveLength(2);
  });

  it('the slice subscribes as a Svelte store', async () => {
    const seen: unknown[] = [];
    const unsub = bridge.app.plans.subscribe((v) => seen.push(v));
    await bridge.app.plans.load();
    unsub();
    expect(seen[0]).toBeNull();
    expect(seen[seen.length - 1]).toEqual([
      { key: 'free', name: 'Free' },
      { key: 'pro', name: 'Pro' },
    ]);
  });

  it('apply() updates a loaded slice (TBP-323 reactive binding primitive)', async () => {
    await bridge.app.plans.load();
    bridge.app.plans.apply([{ key: 'enterprise', name: 'Enterprise' }]);
    expect(get(bridge.app.plans)).toEqual([{ key: 'enterprise', name: 'Enterprise' }]);
  });
});
