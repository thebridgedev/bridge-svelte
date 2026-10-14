// TBP-813 — how the plan cards and the current-plan panel word things.
// Pure functions; a fixed 'en-US' locale keeps the output deterministic.

import { describe, expect, it } from 'vitest';
import type { BillingSubscriptionState, Plan, PriceOfferSdk } from '@nebulr-group/bridge-auth-core';
import {
  formatAmount,
  intervalSuffix,
  minAmount,
  pickKind,
  pickLabel,
  subscriptionMeta,
} from './plan-format.js';

const LOCALE = 'en-US';

const price = (amount: number, recurrenceInterval: PriceOfferSdk['recurrenceInterval'] = 'month') =>
  ({ id: `p-${amount}-${recurrenceInterval}`, amount, currency: 'usd', recurrenceInterval }) as PriceOfferSdk;

const plan = (key: string, name: string, prices: PriceOfferSdk[]) => ({ key, name, prices }) as Plan;

const FREE = plan('free', 'Free', [price(0)]);
const PRO = plan('pro', 'Pro', [price(29), price(290, 'year')]);
const TEAM = plan('team', 'Team', [price(99)]);
const NO_PRICE = plan('custom', 'Custom', []);

const state = (s: Partial<BillingSubscriptionState>): BillingSubscriptionState =>
  ({ plan: { slug: 'pro', name: 'Pro' }, status: 'active', ...s }) as BillingSubscriptionState;

describe('formatAmount — TBP-813', () => {
  it('whole amounts have no decimals; fractional ones have two', () => {
    expect(formatAmount(29, 'usd', LOCALE)).toBe('$29');
    expect(formatAmount(9.5, 'usd', LOCALE)).toBe('$9.50');
    expect(formatAmount(0, 'usd', LOCALE)).toBe('$0');
  });

  it('reads the currency code case-insensitively', () => {
    expect(formatAmount(29, 'USD', LOCALE)).toBe(formatAmount(29, 'usd', LOCALE));
    expect(formatAmount(10, 'eur', LOCALE)).toBe('€10');
  });

  it('a malformed currency code falls back to "<amount> <CODE>" instead of throwing', () => {
    expect(formatAmount(29, 'dollars', LOCALE)).toBe('29 DOLLARS');
    expect(formatAmount(9.5, 'us', LOCALE)).toBe('9.5 US');
    expect(formatAmount(29, '', LOCALE)).toBe('29 ');
  });
});

describe('minAmount — TBP-813', () => {
  it('is the cheapest price across every interval', () => {
    expect(minAmount(PRO)).toBe(29);
    expect(minAmount(FREE)).toBe(0);
  });

  it('a plan with no prices sorts last', () => {
    expect(minAmount(NO_PRICE)).toBe(Number.POSITIVE_INFINITY);
    expect(minAmount({ key: 'x', name: 'X' } as Plan)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('pickKind / pickLabel — TBP-813', () => {
  it('the current plan is "Current plan"', () => {
    expect(pickKind(PRO, PRO)).toBe('current');
    expect(pickLabel('current', PRO)).toBe('Current plan');
  });

  it('with no current plan every card is "Choose X"', () => {
    for (const current of [null, undefined]) {
      expect(pickKind(PRO, current)).toBe('choose');
      expect(pickKind(FREE, current)).toBe('choose');
    }
    expect(pickLabel('choose', PRO)).toBe('Choose Pro');
  });

  it('a pricier plan than the current one is an upgrade', () => {
    expect(pickKind(TEAM, PRO)).toBe('upgrade');
    expect(pickKind(PRO, FREE)).toBe('upgrade');
    expect(pickLabel('upgrade', TEAM)).toBe('Upgrade to Team');
  });

  it('a cheaper or same-priced plan is a switch', () => {
    expect(pickKind(FREE, PRO)).toBe('switch');
    expect(pickKind(plan('pro2', 'Pro 2', [price(29)]), PRO)).toBe('switch');
    expect(pickLabel('switch', FREE)).toBe('Switch to Free');
  });

  it('matching is by key, not by object identity', () => {
    expect(pickKind(PRO, { ...PRO } as Plan)).toBe('current');
  });
});

describe('intervalSuffix — TBP-813', () => {
  it('is "/ <interval>"', () => {
    expect(intervalSuffix(price(29, 'month'))).toBe('/ month');
    expect(intervalSuffix(price(290, 'year'))).toBe('/ year');
  });
});

describe('subscriptionMeta — TBP-813', () => {
  // Mid-day UTC so the date is the same in any time zone the suite runs in.
  const RENEWS = '2026-11-14T12:00:00.000Z';
  const ENDS = '2026-12-01T12:00:00.000Z';

  it('no billing state → empty', () => {
    expect(subscriptionMeta(null, LOCALE)).toBe('');
    expect(subscriptionMeta(undefined, LOCALE)).toBe('');
  });

  it('active: renewal date and the card on file', () => {
    expect(subscriptionMeta(state({ status: 'active', renewsAt: RENEWS, cardLast4: '4242' }), LOCALE)).toBe(
      'Renews Nov 14, 2026 · Card ending 4242',
    );
  });

  it('active with only one of the two says only that one', () => {
    expect(subscriptionMeta(state({ status: 'active', renewsAt: RENEWS }), LOCALE)).toBe('Renews Nov 14, 2026');
    expect(subscriptionMeta(state({ status: 'active', cardLast4: '4242' }), LOCALE)).toBe('Card ending 4242');
  });

  it('active with nothing to say → empty', () => {
    expect(subscriptionMeta(state({ status: 'active' }), LOCALE)).toBe('');
  });

  it('trial: the end date wins over days left', () => {
    expect(subscriptionMeta(state({ status: 'trial', endsAt: ENDS, daysLeft: 9 }), LOCALE)).toBe(
      'Trial ends Dec 1, 2026',
    );
  });

  it('trial without an end date falls back to days left, including 0', () => {
    expect(subscriptionMeta(state({ status: 'trial', daysLeft: 9 }), LOCALE)).toBe('9 days left in trial');
    expect(subscriptionMeta(state({ status: 'trial', daysLeft: 0 }), LOCALE)).toBe('0 days left in trial');
  });

  it('trial never says "Renews", even with a renewal date', () => {
    expect(subscriptionMeta(state({ status: 'trial', renewsAt: RENEWS }), LOCALE)).toBe('');
  });

  it('cancel_at_period_end and canceled: the end date, never a renewal', () => {
    for (const status of ['cancel_at_period_end', 'canceled'] as const) {
      expect(
        subscriptionMeta(state({ status, endsAt: ENDS, renewsAt: RENEWS, cardLast4: '1881' }), LOCALE),
      ).toBe('Ends Dec 1, 2026 · Card ending 1881');
      expect(subscriptionMeta(state({ status, renewsAt: RENEWS }), LOCALE)).toBe('');
    }
  });

  it('past_due reads like active: renewal date when there is one', () => {
    expect(subscriptionMeta(state({ status: 'past_due', renewsAt: RENEWS }), LOCALE)).toBe('Renews Nov 14, 2026');
  });

  it('an unparseable date is left out, not printed as "Invalid Date"', () => {
    expect(subscriptionMeta(state({ status: 'active', renewsAt: 'not-a-date', cardLast4: '4242' }), LOCALE)).toBe(
      'Card ending 4242',
    );
    expect(subscriptionMeta(state({ status: 'cancel_at_period_end', endsAt: 'garbage' }), LOCALE)).toBe('');
  });
});
