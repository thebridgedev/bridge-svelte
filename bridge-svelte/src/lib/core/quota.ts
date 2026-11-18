/**
 * One metric's quota against the plan, for your own UI. The numbers are
 * auth-core's quota store: one read when first asked for, then again when
 * Bridge says a quota or the plan changed.
 *
 * ```svelte
 * <script lang="ts">
 *   import { useQuota } from '@nebulr-group/bridge-svelte';
 *   const projects = useQuota('projects');
 * </script>
 *
 * {#if projects.loading}…{:else if projects.unlimited}Unlimited{:else}{projects.used} of {projects.limit}{/if}
 * ```
 *
 * `useQuota` is also a store, `$projects`, with the numbers only: `{ used, limit, ratio, state }`, or null while loading
 * and for a metric without a limit.
 *
 * Numbers only, never a gate: whether something is allowed is a flag, and your server refuses the write.
 */
import type { Bridge, QuotaSnapshot } from '@nebulr-group/bridge-auth-core';
import { createSubscriber } from 'svelte/reactivity';
import { get, readable, type Readable } from 'svelte/store';
import { bridgeClient } from './client.js';

/** How near a metric is to its limit: `near` from 80%, `over` once the limit is reached. */
export type QuotaLevel = 'ok' | 'near' | 'over';

/** The numbers of a quota, as the store `$useQuota(metric)` holds them. */
export interface Quota {
	readonly used: number;
	readonly limit: number;
	/** `used / limit`; 1 for a limit of 0. */
	readonly ratio: number;
	readonly state: QuotaLevel;
}

/** What `useQuota(metric)` reads. */
export interface QuotaState {
	/** True until Bridge has answered for this metric. The numbers are `null` meanwhile, never 0. */
	readonly loading: boolean;
	/** True once Bridge has answered that the plan puts no limit on the metric. */
	readonly unlimited: boolean;
	/** `counter`: this period's total. `gauge`: how many exist now. `null` while loading or unlimited. */
	readonly used: number | null;
	/** The plan's limit. `null` while loading or unlimited. */
	readonly limit: number | null;
	/** What is left before the limit. `null` while loading or unlimited. */
	readonly remaining: number | null;
	/** `approaching` from 80%, `critical` from 95%; `null` below that, while loading or unlimited. */
	readonly warningLevel: 'approaching' | 'critical' | null;
	/** `counter` counts up from your server's usage reports and resets each period; `gauge` is the level your server sets. */
	readonly kind: 'counter' | 'gauge' | null;
	/** The whole snapshot (policy, overage), or `null` while loading or unlimited. */
	readonly snapshot: QuotaSnapshot | null;
}

/** `useQuota(metric)`: the state as properties, and the numbers as a store. */
export type QuotaHandle = QuotaState & Readable<Quota | null>;

/** From this share of the limit, a metric is `near` it. */
export const NEAR_LIMIT = 0.8;
const CRITICAL = 0.95;

/** A snapshot's numbers for the store. */
export function quotaOf(snapshot: QuotaSnapshot): Quota {
	const { used, limit } = snapshot;
	const ratio = limit > 0 ? used / limit : 1;
	return { used, limit, ratio, state: used >= limit ? 'over' : ratio >= NEAR_LIMIT ? 'near' : 'ok' };
}

/**
 * How near a hard limit a snapshot is: the server's level, or from the numbers when it sent none. The same 80% and 95%
 * the server uses.
 */
export function warningOf(snapshot: QuotaSnapshot): 'approaching' | 'critical' | null {
	if (snapshot.warningLevel !== null) return snapshot.warningLevel;
	if (snapshot.limit <= 0) return null;
	const ratio = snapshot.used / snapshot.limit;
	return ratio >= CRITICAL ? 'critical' : ratio >= NEAR_LIMIT ? 'approaching' : null;
}

// The quota store answers "no limit on this plan" by deleting the metric and telling `undefined`, and keeps no record of
// it: a reader that read again on that would ask again for as long as the page is open. The answers are remembered here,
// once per client, and a remembered metric is not asked for again until the person or workspace changes.
interface Tracking {
	readonly unlimited: Set<string>;
	workspace: string | null | undefined;
}
const tracked = new WeakMap<Bridge, Tracking>();

function trackingOf(client: Bridge): Tracking {
	let t = tracked.get(client);
	if (t === undefined) {
		const made: Tracking = { unlimited: new Set(), workspace: undefined };
		t = made;
		tracked.set(client, made);
		client.quotas.subscribe((metric, snapshot) => {
			if (snapshot === undefined) made.unlimited.add(metric);
			else made.unlimited.delete(metric);
		});
	}
	return t;
}

function noteSession(t: Tracking, key: string | null): void {
	// Another person or workspace has another plan, and signing out ends the answers: what was "unlimited" no longer holds.
	if (t.workspace !== undefined && key !== t.workspace) t.unlimited.clear();
	t.workspace = key;
}

const LOADING: QuotaState = Object.freeze({ loading: true, unlimited: false, used: null, limit: null, remaining: null, warningLevel: null, kind: null, snapshot: null });
const UNLIMITED: QuotaState = Object.freeze({ ...LOADING, loading: false, unlimited: true });

function readState(metric: string): QuotaState {
	const client = get(bridgeClient);
	if (client === null) return LOADING;
	const t = trackingOf(client);
	// The first read starts the request; the store dedupes one in flight.
	const snapshot = t.unlimited.has(metric) ? client.quotas.get(metric) : client.quota(metric);
	if (snapshot !== undefined) {
		return { loading: false, unlimited: false, used: snapshot.used, limit: snapshot.limit, remaining: snapshot.remaining, warningLevel: warningOf(snapshot), kind: snapshot.kind === 'gauge' ? 'gauge' : 'counter', snapshot };
	}
	return t.unlimited.has(metric) ? UNLIMITED : LOADING;
}

function quotaStore(key: () => string): Readable<Quota | null> {
	return readable<Quota | null>(null, (set) => {
		let stopQuota: (() => void) | undefined;
		const stopClient = bridgeClient.subscribe((client) => {
			stopQuota?.();
			stopQuota = undefined;
			if (client === null) {
				set(null);
				return;
			}
			const push = () => {
				const snapshot = client.quotas.get(key());
				set(snapshot === undefined ? null : quotaOf(snapshot));
			};
			stopQuota = client.quotas.subscribe((metric) => {
				if (metric === key()) push();
			});
			// Not for a metric already answered as unlimited: the store would read it again for every reader.
			if (!trackingOf(client).unlimited.has(key())) client.quota(key());
			push();
		});
		return () => {
			stopClient();
			stopQuota?.();
		};
	});
}

/**
 * Live numbers for one metric, as properties for a component or a `$derived`, and as the store `$projects`.
 *
 * @param metric The metric's key, such as `projects`. Pass `() => metric` when it changes, such as a prop.
 */
export function useQuota(metric: string | (() => string)): QuotaHandle {
	const key = typeof metric === 'function' ? metric : () => metric;

	const subscribe = createSubscriber((update) => {
		let stopQuota: (() => void) | undefined;
		let stopSession: (() => void) | undefined;
		const stopClient = bridgeClient.subscribe((client) => {
			stopQuota?.();
			stopSession?.();
			stopQuota = stopSession = undefined;
			if (client !== null) {
				const t = trackingOf(client);
				stopQuota = client.quotas.subscribe((m) => {
					if (m === key()) update();
				});
				stopSession = client.session.subscribe((s) => {
					noteSession(t, s.status === 'signed-in' ? `${s.user.id}|${s.workspace?.id ?? ''}` : null);
					// A person signing in is what lets a read made before it start.
					queueMicrotask(update);
				});
			}
			update();
		});
		return () => {
			stopClient();
			stopQuota?.();
			stopSession?.();
		};
	});

	const current = (): QuotaState => {
		subscribe();
		return readState(key());
	};

	const store = quotaStore(key);
	return {
		subscribe: store.subscribe,
		get loading() {
			return current().loading;
		},
		get unlimited() {
			return current().unlimited;
		},
		get used() {
			return current().used;
		},
		get limit() {
			return current().limit;
		},
		get remaining() {
			return current().remaining;
		},
		get warningLevel() {
			return current().warningLevel;
		},
		get kind() {
			return current().kind;
		},
		get snapshot() {
			return current().snapshot;
		},
	};
}
