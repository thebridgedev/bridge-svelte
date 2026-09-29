// TBP-762 — the billing store: one set of stores, one refresh rule.
//
// Reproduces what the owner hit on stage on 2026-09-29: right after a Stripe
// checkout Bridge marks the sign-in out of date, and the badge's
// `GET /billing/state` answered 401 TOKEN_VERSION_STALE and was never retried,
// so the page said "Subscription unavailable" until a reload; a plan list read
// once was served for the life of the tab.
//
// The real bridge-instance and billing-store run here. auth-core's BridgeAuth
// and the HTTP read of `/billing/state` are doubles; the canonical billing
// store is auth-core's own BridgeSubscription.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  type Handler = (payload?: unknown) => void;
  const s = {
    token: 'h.eyJ0aWQiOiJ3cy0xIn0.s' as string | null,
    handlers: new Map<string, Handler[]>(),
    status: [] as Array<() => Promise<unknown>>,
    plans: [] as Array<() => Promise<unknown>>,
    billing: [] as Array<() => Promise<unknown>>,
    statusCalls: 0,
    plansCalls: 0,
    billingCalls: [] as Array<{ accessToken: string; onTokenStale?: unknown }>,
    subscription: null as unknown,
    reconciled: [] as Array<[string, number | undefined]>,
  };
  const staleHandler = async () => 'renewed';
  class FakeBridgeAuth {
    constructor(_cfg: unknown) {}
    getTokens() {
      return s.token ? { accessToken: s.token } : null;
    }
    getAuthState() {
      return 'authenticated';
    }
    getProfile() {
      return Promise.resolve(null);
    }
    on(event: string, fn: Handler) {
      const list = s.handlers.get(event) ?? [];
      list.push(fn);
      s.handlers.set(event, list);
    }
    getApiContext() {
      return { apiBaseUrl: 'http://api', appId: 'app-1', accessToken: s.token };
    }
    tokenStaleHandler() {
      return staleHandler;
    }
    getSubscriptionStatus() {
      s.statusCalls += 1;
      const next = s.status.shift();
      return next ? next() : Promise.resolve({ plan: 'free' });
    }
    getPlans() {
      s.plansCalls += 1;
      const next = s.plans.shift();
      return next ? next() : Promise.resolve([{ key: 'free', name: 'Free', prices: [] }]);
    }
  }
  const emit = (event: string, payload?: unknown) => {
    for (const fn of s.handlers.get(event) ?? []) fn(payload);
  };
  return { s, staleHandler, FakeBridgeAuth, emit };
});

vi.mock('@nebulr-group/bridge-auth-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nebulr-group/bridge-auth-core')>();
  return {
    ...actual,
    BridgeAuth: h.FakeBridgeAuth,
    fetchBillingState: vi.fn(async (opts: { accessToken: string; onTokenStale?: unknown }) => {
      h.s.billingCalls.push(opts);
      const next = h.s.billing.shift();
      return next ? next() : { plan: { slug: 'free', name: 'Free' }, status: 'active' };
    }),
    useBridge: () => ({
      subscription: h.s.subscription,
      quotas: {
        reconcileAfterReport: (metric: string, delayMs?: number) => h.s.reconciled.push([metric, delayMs]),
      },
    }),
  };
});

import { BridgeSubscription } from '@nebulr-group/bridge-auth-core';
import { get } from 'svelte/store';
import {
  __resetSubscriptionForTests,
  __setBillingRetryDelay,
  ensureSubscription,
  initBridge,
  loadSubscription,
  subscriptionStore,
} from './bridge-instance.js';
import {
  __resetBillingStoreForTests,
  billingEventReceived,
  ensureBillingState,
  refreshBilling,
  refreshBillingState,
  refreshQuota,
  startBillingRefresh,
} from './billing-store.js';
import { subscriptionBadgeView } from '../client/components/subscription/subscription-badge.js';

const STALE = () => Promise.reject(Object.assign(new Error('TOKEN_VERSION_STALE'), { status: 401 }));
const PRO = { plan: { slug: 'pro', name: 'Pro' }, status: 'active' };
const FREE = { plan: { slug: 'free', name: 'Free' }, status: 'active' };

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function sub(): BridgeSubscription {
  return h.s.subscription as BridgeSubscription;
}

initBridge({ appId: 'app-1' } as never);

beforeEach(() => {
  h.s.token = 'h.eyJ0aWQiOiJ3cy0xIn0.s';
  h.s.status = [];
  h.s.plans = [];
  h.s.billing = [];
  h.s.statusCalls = 0;
  h.s.plansCalls = 0;
  h.s.billingCalls = [];
  h.s.subscription = new BridgeSubscription();
  h.s.reconciled = [];
  __setBillingRetryDelay(5);
  __resetSubscriptionForTests();
  __resetBillingStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the billing state read (the "Current plan" badge) — TBP-762', () => {
  it('passes the stale-sign-in handler, so a 401 TOKEN_VERSION_STALE renews the sign-in and retries', async () => {
    await refreshBillingState();
    expect(h.s.billingCalls).toHaveLength(1);
    expect(h.s.billingCalls[0].onTokenStale).toBe(h.staleHandler);
  });

  it('a read that still fails is retried once, and the badge says "Loading…" — not an error — meanwhile', async () => {
    const second = deferred<unknown>();
    h.s.billing = [STALE, () => second.promise];
    const read = refreshBillingState();
    await vi.waitFor(() => expect(h.s.billingCalls).toHaveLength(2));
    expect(subscriptionBadgeView(sub().snapshot(), false, false)).toEqual({ kind: 'loading' });
    second.resolve(PRO);
    await read;
    expect(subscriptionBadgeView(sub().snapshot(), false, false)).toEqual({ kind: 'plan', name: 'Pro', status: 'active' });
  });

  it('only when the retry fails too does it become "Subscription unavailable"; debug mode shows why', async () => {
    h.s.billing = [STALE, STALE];
    await refreshBillingState();
    expect(subscriptionBadgeView(sub().snapshot(), false, false)).toEqual({ kind: 'error', reason: null });
    expect(subscriptionBadgeView(sub().snapshot(), false, true)).toEqual({ kind: 'error', reason: 'TOKEN_VERSION_STALE' });
  });

  it('a failed background re-read keeps the plan on screen — no "Loading…" flash, no error', async () => {
    await refreshBillingState();
    h.s.billing = [STALE, STALE];
    const seen: string[] = [];
    const off = sub().subscribe((snap) => seen.push(subscriptionBadgeView(snap, false, false).kind));
    await refreshBillingState();
    off();
    expect(seen).not.toContain('loading');
    expect(subscriptionBadgeView(sub().snapshot(), false, false)).toEqual({ kind: 'plan', name: 'Free', status: 'active' });
  });

  it('a read asked for while one is in flight gets its own read after it (the first may predate the change)', async () => {
    const first = deferred<unknown>();
    h.s.billing = [() => first.promise, async () => PRO];
    const a = refreshBillingState();
    const b = refreshBillingState();
    first.resolve(FREE);
    await Promise.all([a, b]);
    expect(h.s.billingCalls).toHaveLength(2);
    expect(sub().snapshot().state?.plan.slug).toBe('pro');
  });

  it('ensureBillingState reuses a read younger than 30 s and re-reads an older one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await ensureBillingState();
    await ensureBillingState();
    expect(h.s.billingCalls).toHaveLength(1);
    vi.setSystemTime(Date.now() + 31_000);
    await ensureBillingState();
    expect(h.s.billingCalls).toHaveLength(2);
  });
});

describe('the plan list and current plan — TBP-762', () => {
  it('an empty plan list is asked for once more before it is believed', async () => {
    h.s.plans = [async () => [], async () => [{ key: 'pro', name: 'Pro', prices: [] }]];
    await loadSubscription();
    expect(h.s.plansCalls).toBe(2);
    expect(get(subscriptionStore).plans).toEqual([{ key: 'pro', name: 'Pro', prices: [] }]);
  });

  it('a failed read is retried once', async () => {
    h.s.plans = [STALE];
    await loadSubscription();
    expect(get(subscriptionStore)).toMatchObject({ error: null, loading: false, plans: [{ key: 'free' }] });
  });

  it('a failed re-read keeps the last good list on screen instead of an error', async () => {
    await loadSubscription();
    h.s.plans = [STALE, STALE];
    await loadSubscription();
    expect(get(subscriptionStore)).toMatchObject({ error: null, loading: false, plans: [{ key: 'free' }] });
  });

  it('a plan added after the first read shows up on the next read (the store never serves one list forever)', async () => {
    await loadSubscription();
    h.s.plans = [async () => [{ key: 'free' }, { key: 'team' }]];
    await refreshBilling();
    expect(get(subscriptionStore).plans).toEqual([{ key: 'free' }, { key: 'team' }]);
  });

  it('an answer that lands after a workspace switch is dropped', async () => {
    const late = deferred<unknown>();
    h.s.plans = [() => late.promise];
    const read = loadSubscription();
    h.emit('auth:workspace-changed', { accessToken: 'other' });
    late.resolve([{ key: 'old-workspace-plan' }]);
    await read;
    expect(get(subscriptionStore).plans).toBeNull();
  });

  it('sign-out clears the plan so the next user does not see it', async () => {
    await loadSubscription();
    h.emit('auth:logout');
    expect(get(subscriptionStore)).toMatchObject({ status: null, plans: null });
  });

  it('ensureSubscription reuses a read younger than 30 s', async () => {
    await ensureSubscription();
    await ensureSubscription();
    expect(h.s.plansCalls).toBe(1);
  });
});

describe('the refresh rule — TBP-762', () => {
  it('a live plan / subscription / payment event re-reads the plan list and the billing state', async () => {
    await loadSubscription();
    await refreshBillingState();
    h.s.plans = [async () => [{ key: 'free' }, { key: 'pro' }]];
    h.s.billing = [async () => PRO];
    billingEventReceived('subscription.plan_changed');
    await vi.waitFor(() => expect(sub().snapshot().state?.plan.slug).toBe('pro'));
    await vi.waitFor(() => expect(get(subscriptionStore).plans).toHaveLength(2));
  });

  it('events that do not change the plan do not re-read', async () => {
    await loadSubscription();
    await refreshBillingState();
    billingEventReceived('quota.updated');
    billingEventReceived('subscription.trial_ending_soon');
    await new Promise((r) => setTimeout(r, 10));
    expect(h.s.plansCalls).toBe(1);
    expect(h.s.billingCalls).toHaveLength(1);
  });

  it('a renewed sign-in (new token) re-reads both; the current token on start does not', async () => {
    await loadSubscription();
    await refreshBillingState();
    startBillingRefresh();
    await new Promise((r) => setTimeout(r, 10));
    expect(h.s.plansCalls).toBe(1);
    h.s.billing = [async () => PRO];
    h.emit('auth:token-refreshed', { accessToken: 'h.eyJ0aWQiOiJ3cy0xIn0.renewed' });
    await vi.waitFor(() => expect(sub().snapshot().state?.plan.slug).toBe('pro'));
    expect(h.s.plansCalls).toBe(2);
  });

  it('tab focus re-reads only when the last read is older than 30 s', async () => {
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', doc);
    vi.useFakeTimers({ toFake: ['Date'] });
    await loadSubscription();
    await refreshBillingState();
    startBillingRefresh();

    win.dispatchEvent(new Event('focus'));
    await new Promise((r) => setTimeout(r, 10));
    expect(h.s.plansCalls).toBe(1);
    expect(h.s.billingCalls).toHaveLength(1);

    vi.setSystemTime(Date.now() + 31_000);
    doc.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(h.s.billingCalls).toHaveLength(2));
    expect(h.s.plansCalls).toBe(2);
  });

  it('an app that never showed billing makes no billing reads on these triggers', async () => {
    startBillingRefresh();
    billingEventReceived('subscription.plan_changed');
    h.emit('auth:token-refreshed', { accessToken: 'h.eyJ0aWQiOiJ3cy0xIn0.renewed' });
    await new Promise((r) => setTimeout(r, 10));
    expect(h.s.plansCalls).toBe(0);
    expect(h.s.billingCalls).toHaveLength(0);
  });
});

describe('refreshQuota — TBP-763', () => {
  it('re-reads one quota now (the seat count after a team change)', () => {
    refreshQuota('seats');
    expect(h.s.reconciled).toEqual([['seats', 0]]);
  });
});
