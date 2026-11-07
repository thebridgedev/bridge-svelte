/**
 * One metric's usage against its plan limit, for your own UI:
 *
 * ```svelte
 * const projects = useQuota('projects');
 * {#if $projects}{$projects.used} of {$projects.limit} projects{/if}
 * ```
 *
 * Numbers only, never a gate: whether something is allowed is a flag.
 */
import type { UsageNumbers } from '@nebulr-group/bridge-auth-core';
import { derived, type Readable } from 'svelte/store';
import { usage } from '../../core/stores.js';

export type QuotaState = 'ok' | 'near' | 'over';

export interface Quota {
	readonly used: number;
	readonly limit: number;
	/** `used / limit`; 1 for a limit of 0. */
	readonly ratio: number;
	/** `near` from 80% of the limit, `over` once the limit is reached. */
	readonly state: QuotaState;
}

/** From this share of the limit, a metric is `near` it. */
export const NEAR_LIMIT = 0.8;

/** A metric's quota from the usage numbers, or null when it has no limit or is not loaded. */
export function quotaFor(numbers: UsageNumbers | null | undefined, metric: string): Quota | null {
	const row = numbers?.metrics.find((m) => m.metric === metric);
	if (!row || row.limit === null) return null;
	const { used, limit } = row;
	const ratio = limit > 0 ? used / limit : 1;
	const state: QuotaState = used >= limit ? 'over' : ratio >= NEAR_LIMIT ? 'near' : 'ok';
	return { used, limit, ratio, state };
}

/** A metric's quota as a store: null while loading and for a metric without a limit. */
export function useQuota(metric: string): Readable<Quota | null> {
	return derived(usage, (numbers) => quotaFor(numbers.value, metric));
}
