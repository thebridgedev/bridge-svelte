// TBP-813 — how the plan cards and the current-plan panel word things, as pure
// functions. Prices are whole currency units (29 = 29 USD), as Bridge stores them.

import type { BillingSubscriptionState, Plan, PriceOfferSdk } from '@nebulr-group/bridge-auth-core';

/** `29` + `usd` → `$29`; `9.5` → `$9.50`. An unknown currency code falls back to `29 XYZ`. */
export function formatAmount(amount: number, currency: string, locale?: string): string {
  const code = currency.toUpperCase();
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${code}`;
  }
}

/** The cheapest price a plan has in any interval; plans with none sort last. */
export function minAmount(plan: Plan): number {
  const amounts = (plan.prices ?? []).map((p) => p.amount);
  return amounts.length > 0 ? Math.min(...amounts) : Number.POSITIVE_INFINITY;
}

/** What picking a plan does, relative to the current one. */
export type PickKind = 'current' | 'choose' | 'upgrade' | 'switch';

export function pickKind(plan: Plan, current: Plan | null | undefined): PickKind {
  if (current && current.key === plan.key) return 'current';
  if (!current) return 'choose';
  return minAmount(plan) > minAmount(current) ? 'upgrade' : 'switch';
}

/** The button text for a pick. */
export function pickLabel(kind: PickKind, plan: Plan): string {
  switch (kind) {
    case 'current':
      return 'Current plan';
    case 'upgrade':
      return `Upgrade to ${plan.name}`;
    case 'switch':
      return `Switch to ${plan.name}`;
    default:
      return `Choose ${plan.name}`;
  }
}

/** `/ month`, after a price. */
export function intervalSuffix(price: PriceOfferSdk): string {
  return `/ ${price.recurrenceInterval}`;
}

function formatDate(iso: string | undefined, locale?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * The line under the current plan's name: renewal or end date, and the card on
 * file. Only what the billing state actually carries; empty when it has none.
 */
export function subscriptionMeta(state: BillingSubscriptionState | null | undefined, locale?: string): string {
  if (!state) return '';
  const parts: string[] = [];
  const renews = formatDate(state.renewsAt, locale);
  const ends = formatDate(state.endsAt, locale);
  if (state.status === 'trial') {
    if (ends) parts.push(`Trial ends ${ends}`);
    else if (typeof state.daysLeft === 'number') parts.push(`${state.daysLeft} days left in trial`);
  } else if (state.status === 'cancel_at_period_end' || state.status === 'canceled') {
    if (ends) parts.push(`Ends ${ends}`);
  } else if (renews) {
    parts.push(`Renews ${renews}`);
  }
  if (state.cardLast4) parts.push(`Card ending ${state.cardLast4}`);
  return parts.join(' · ');
}
