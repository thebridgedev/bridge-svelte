/**
 * `entitlements`: which plan features the workspace has, as one store.
 *
 * ```svelte
 * {#if !$entitlements.ready}…{:else if $entitlements.can('analytics')}<Analytics />{:else}Upgrade for analytics{/if}
 * ```
 *
 * A plan feature is the flag `bridge:billing.entitlement.<key>`: `can('analytics')` reads that flag, never the plan, so
 * a rule on the flag (a rollout, a privilege) is honoured. It is fail-closed: `false` until Bridge has answered and for a
 * feature the plan does not have, and `ready` tells those two apart. It moves when the flags do.
 */
import { derived, type Readable } from 'svelte/store';
import { bridgeClient } from './client.js';
import { flags, flagsStatus } from './stores.js';

export interface EntitlementsState {
	/** True once Bridge has answered. Before that every `can()` is `false`. */
	readonly ready: boolean;
	/** `true` only when the plan has the feature `key` on. */
	can(key: string): boolean;
	/** Every plan feature Bridge gave a result for, `{ key: on }`. */
	readonly all: Readonly<Record<string, boolean>>;
}

const NOT_READY: EntitlementsState = Object.freeze({ ready: false, all: Object.freeze({}), can: () => false });

export const entitlements: Readable<EntitlementsState> = derived([bridgeClient, flags, flagsStatus], ([client, , status]): EntitlementsState => {
	if (client === null || status !== 'ready') return NOT_READY;
	const all = Object.freeze(client.entitlements.all());
	return Object.freeze({ ready: true, all, can: (key: string) => client.entitlements.can(key) });
});
