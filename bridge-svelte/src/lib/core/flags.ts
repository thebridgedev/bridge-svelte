/**
 * Reading flags in your own code. Every gate is a flag, and its rule says
 * why (a privilege, a plan feature or a rollout). A flag Bridge gave no result
 * for gives the fallback you pass, so gates fail closed.
 */
import type { FlagReason } from '@nebulr-group/bridge-auth-core';
import { error, redirect } from '@sveltejs/kit';
import { derived, fromStore, get, type Readable } from 'svelte/store';
import { bridgeClient, getBridge, getConfig } from './client.js';
import { flags } from './stores.js';

/** A flag's value as a store: `$reports` in a component. */
export function flag<T = boolean>(key: string, fallback?: T): Readable<T> {
	const otherwise = (fallback ?? false) as T;
	return derived([bridgeClient, flags], ([client]) => (client === null ? otherwise : client.flags.get<T>(key, otherwise)));
}

/** Why a flag has its value, as a store. */
export function flagReason(key: string): Readable<FlagReason | null> {
	return derived([bridgeClient, flags], ([client]) => (client === null ? null : client.flags.reason(key)));
}

/**
 * A flag's value as a rune, for `<script>` blocks:
 *
 * ```svelte
 * const reports = useFlag('reports');
 * {#if reports.value}<Reports />{/if}
 * ```
 */
export function useFlag<T = boolean>(key: string, fallback?: T): { readonly value: T; readonly reason: FlagReason | null } {
	const value = fromStore(flag<T>(key, fallback));
	const why = fromStore(flagReason(key));
	return {
		get value() {
			return value.current;
		},
		get reason() {
			return why.current;
		},
	};
}

/**
 * For a page's load function: goes on only when the flag is on, else sends
 * the person to `redirectTo`, or answers 403.
 *
 * ```ts
 * export const load = async ({ parent }) => {
 *   await parent();
 *   await requireFlag('reports', { redirectTo: '/' });
 * };
 * ```
 */
export async function requireFlag(key: string, options: { redirectTo?: string } = {}): Promise<void> {
	const client = getBridge();
	await client.ready.catch(() => undefined);
	if (get(client.flags.status) !== 'ready') await client.flags.load().catch(() => undefined);
	if (client.flags.enabled(key)) return;
	if (options.redirectTo !== undefined) redirect(307, options.redirectTo);
	error(403, 'Forbidden');
}

/** Whether the person may manage billing: the `billingManage` flag. */
export function canManageBilling(): Readable<boolean> {
	return derived([bridgeClient, flags], ([client]) => client !== null && client.flags.enabled(getConfig().flagKeys.billingManage));
}

/** Whether the person may manage the team: the `teamManage` flag. */
export function canManageTeam(): Readable<boolean> {
	return derived([bridgeClient, flags], ([client]) => client !== null && client.flags.enabled(getConfig().flagKeys.teamManage));
}
