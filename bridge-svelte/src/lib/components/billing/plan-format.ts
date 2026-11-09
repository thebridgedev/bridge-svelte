/**
 * How the billing components word plans, prices and billing facts, as pure
 * functions. Amounts are in the currency's minor units (2000 EUR is 20.00 EUR).
 */
import type { BillingFacts, Plan, Price } from '@nebulr-group/bridge-auth-core';

/** How many decimals a currency has: 2 for EUR, 0 for JPY. */
function currencyDigits(code: string): number {
	try {
		return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
	} catch {
		return 2;
	}
}

/** `2900` + `usd` → `$29`; `950` → `$9.50`. An unknown currency code reads `29 XYZ`. */
export function formatAmount(amount: number, currency: string, locale?: string): string {
	const code = currency.toUpperCase();
	const value = amount / 10 ** currencyDigits(code);
	try {
		return new Intl.NumberFormat(locale, {
			style: 'currency',
			currency: code,
			...(Number.isInteger(value) ? { minimumFractionDigits: 0 } : {}),
		}).format(value);
	} catch {
		return `${value} ${code}`;
	}
}

/** `/ month`, after a price; nothing for a price without an interval. */
export function intervalSuffix(price: Price): string {
	return price.interval ? `/ ${price.interval}` : '';
}

/** `$29 / month`, or `Free`. */
export function formatPrice(price: Price | undefined): string {
	if (!price || price.amount === 0) return 'Free';
	const suffix = intervalSuffix(price);
	return suffix ? `${formatAmount(price.amount, price.currency)} ${suffix}` : formatAmount(price.amount, price.currency);
}

/** The cheapest price a plan has in any interval; a plan with no price and not free sorts last. */
export function minAmount(plan: Plan): number {
	if (plan.free) return 0;
	const amounts = plan.prices.map((p) => p.amount);
	return amounts.length > 0 ? Math.min(...amounts) : Number.POSITIVE_INFINITY;
}

/** A pick that costs nothing: a free plan, a plan without prices, or a zero price. */
export function isFreePick(plan: Plan, price: Price | undefined): boolean {
	return plan.free || price === undefined || price.amount === 0;
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

/** A plan's trial length in days, or null for none. */
export function trialDays(plan: Plan): number | null {
	const trial = plan.trial;
	const days = typeof trial === 'number' ? trial : trial !== null && typeof trial === 'object' ? (trial as { days?: unknown }).days : null;
	return typeof days === 'number' && days > 0 ? days : null;
}

/** The features a plan includes, for its card. */
export function planFeatures(plan: Plan): { key: string; name: string }[] {
	const features: unknown = plan.features;
	if (Array.isArray(features)) {
		return features.filter((f): f is string => typeof f === 'string').map((key) => ({ key, name: key }));
	}
	if (features === null || typeof features !== 'object') return [];
	return Object.entries(features as Record<string, unknown>)
		.filter(([, value]) => value !== false && value !== null && value !== undefined)
		.map(([key, value]) => ({ key, name: typeof value === 'string' ? value : key }));
}

/** `Mar 4, 2027`, or null for no date. */
export function formatDate(iso: string | null | undefined, locale?: string): string | null {
	if (!iso) return null;
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** The line under the current plan's name: when the trial or period ends, or when it renews. */
export function subscriptionMeta(facts: BillingFacts | null | undefined, locale?: string): string {
	if (!facts) return '';
	if (facts.status === 'trialing') {
		const ends = formatDate(facts.trialEnd, locale);
		return ends ? `Trial ends ${ends}` : '';
	}
	const end = formatDate(facts.periodEnd, locale);
	if (!end) return '';
	if (facts.cancelAtPeriodEnd || facts.status === 'canceled') return `Ends ${end}`;
	return facts.status === 'active' ? `Renews ${end}` : '';
}

/** The status badge beside the plan's name, or null when there is nothing to say. */
export function statusBadge(facts: BillingFacts): { status: string; label: string } | null {
	if (facts.cancelAtPeriodEnd && facts.status !== 'canceled') return { status: 'ending', label: 'ending' };
	switch (facts.status) {
		case 'trialing':
			return { status: 'trialing', label: 'trial' };
		case 'active':
			return { status: 'active', label: 'active' };
		case 'past_due':
			return { status: 'past_due', label: 'past due' };
		case 'canceled':
			return { status: 'canceled', label: 'canceled' };
		default:
			return null;
	}
}
