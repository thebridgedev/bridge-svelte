// TBP-762 — picking Free on the plan picker goes on, like a paid pick does.
//
// Before: a Free pick re-read the subscription and then called `onSelect` —
// which /subscription/plan never passed — so the person stayed on the picker as
// if nothing had happened. The paid path leaves for Stripe and comes back to
// `successRedirect`. <PlanSelector> runs `pickPlan` as its whole pick flow.

import { describe, expect, it, vi } from 'vitest';
import type { Plan, PriceOfferSdk } from '@nebulr-group/bridge-auth-core';
import { pickPlan } from './plan-pick.js';

const FREE_PRICE = { id: 'f', amount: 0, currency: 'usd', recurrenceInterval: 'month' } as PriceOfferSdk;
const PAID_PRICE = { id: 'p', amount: 20, currency: 'usd', recurrenceInterval: 'month' } as PriceOfferSdk;
const FREE = { key: 'free', name: 'Free', prices: [FREE_PRICE] } as Plan;
const PRO = { key: 'pro', name: 'Pro', prices: [PAID_PRICE] } as Plan;

function setup(session: { sessionId: string | null; checkoutUrl?: string | null } = { sessionId: 'cs_1', checkoutUrl: 'https://stripe/checkout' }) {
  const order: string[] = [];
  const deps = {
    auth: {
      selectFreePlan: vi.fn(async () => { order.push('select'); }),
      startCheckout: vi.fn(async () => session),
    },
    refresh: vi.fn(async () => { order.push('refresh'); }),
    navigate: vi.fn((url: string) => { order.push(`navigate:${url}`); }),
    leave: vi.fn((url: string) => { order.push(`leave:${url}`); }),
  };
  const opts = {
    paymentsEnabled: false,
    successRedirect: '/subscription/success',
    cancelRedirect: '/subscription/plan',
    callbackBase: 'http://app/auth/oauth-callback',
  };
  return { order, deps, opts };
}

describe('pickPlan — TBP-762', () => {
  it('Free: selects, re-reads the billing store, then goes where a paid checkout returns to', async () => {
    const { order, deps, opts } = setup();
    expect(await pickPlan(FREE, FREE_PRICE, opts, deps)).toBe('selected');
    expect(order).toEqual(['select', 'refresh', 'navigate:/subscription/success']);
  });

  it('a page that passes onSelect takes over: no navigation', async () => {
    const { deps, opts } = setup();
    const onSelect = vi.fn();
    await pickPlan(FREE, FREE_PRICE, { ...opts, onSelect }, deps);
    expect(onSelect).toHaveBeenCalledWith({ plan: FREE, price: FREE_PRICE });
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  it('a paid pick leaves for Stripe with the success page as the return address', async () => {
    const { deps, opts } = setup();
    expect(await pickPlan(PRO, PAID_PRICE, opts, deps)).toBe('checkout');
    expect(deps.leave).toHaveBeenCalledWith('https://stripe/checkout');
    const urls = (deps.auth.startCheckout.mock.calls[0] as unknown[])[2] as { successUrl: string };
    expect(urls.successUrl).toContain(`redirect=${encodeURIComponent('/subscription/success')}`);
  });

  it('a paid pick on an app without Stripe (Bridge sets the plan) also re-reads and goes on', async () => {
    const { order, deps, opts } = setup({ sessionId: null });
    expect(await pickPlan(PRO, PAID_PRICE, opts, deps)).toBe('selected');
    expect(order).toEqual(['refresh', 'navigate:/subscription/success']);
  });

  it('a workspace that already pays is asked to confirm first; nothing is changed yet', async () => {
    const { deps, opts } = setup();
    expect(await pickPlan(PRO, PAID_PRICE, { ...opts, paymentsEnabled: true }, deps)).toBe('confirm');
    expect(deps.auth.startCheckout).not.toHaveBeenCalled();
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  it('a $0 plan with metered pricing is not Free: it goes through checkout (TBP-275)', async () => {
    const { deps, opts } = setup();
    const metered = { ...FREE, key: 'metered', hasCost: true } as Plan;
    expect(await pickPlan(metered, FREE_PRICE, opts, deps)).toBe('checkout');
    expect(deps.auth.selectFreePlan).not.toHaveBeenCalled();
  });
});
