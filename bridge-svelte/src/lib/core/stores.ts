/**
 * Svelte stores over the page's Bridge client. Each one is safe to subscribe
 * to before bridgeBootstrap has run: it waits for the client.
 *
 * Who is signed in (`session`, `user`, `workspace`) and the flag results
 * come straight from the client. What lives in Bridge (`workspaces`, `me`,
 * `billing`, `plans`, `usage`) is a resource: fetched when first shown,
 * again when the person or workspace changes, and again within a second of a
 * Live notice that it changed.
 */
import type {
	Bridge,
	BillingFacts,
	FlagResult,
	FlagsStatus,
	LiveNotice,
	LiveStatus,
	Me,
	MyWorkspace,
	Plan,
	SessionState,
	SessionUser,
	UsageNumbers,
} from '@nebulr-group/bridge-auth-core';
import { MANY_CHANGED } from '@nebulr-group/bridge-auth-core';
import { derived, writable, type Readable } from 'svelte/store';
import { bridgeClient } from './client.js';

/** Follows a store of the client, once there is a client. */
function fromClient<T>(pick: (client: Bridge) => { subscribe(listener: (value: T) => void): () => void }, initial: T): Readable<T> {
	return derived<Readable<Bridge | null>, T>(
		bridgeClient,
		(client, set) => {
			if (client === null) {
				set(initial);
				return;
			}
			return pick(client).subscribe(set);
		},
		initial,
	);
}

const LOADING: SessionState = { status: 'loading' };

/** Who is signed in: `loading`, `signed-out` (with why) or `signed-in` (with the user and workspace). */
export const session: Readable<SessionState> = fromClient((client) => client.session, LOADING);

/** The signed-in user, or null. */
export const user: Readable<SessionUser | null> = derived(session, (s) => (s.status === 'signed-in' ? s.user : null));

/** Whether someone is signed in. */
export const signedIn: Readable<boolean> = derived(session, (s) => s.status === 'signed-in');

/** Every flag result Bridge gave for this person (or visitor) and workspace. */
export const flags: Readable<ReadonlyMap<string, FlagResult>> = fromClient<ReadonlyMap<string, FlagResult>>(
	(client) => client.flags,
	new Map(),
);

/** Whether flag results have loaded: `idle`, `loading`, `ready` or `error`. */
export const flagsStatus: Readable<FlagsStatus> = fromClient((client) => client.flags.status, 'idle' as FlagsStatus);

/** The Live connection: `off`, `connecting`, `open`, `polling` or `closed`. */
export const liveStatus: Readable<LiveStatus> = fromClient((client) => client.live.status, 'off' as LiveStatus);

/** A value fetched from Bridge, with how the fetch is going. */
export interface Resource<T> {
	readonly value: T | null;
	readonly loading: boolean;
	readonly error: unknown;
}

export interface ResourceStore<T> extends Readable<Resource<T>> {
	/** Fetches it again now. */
	refresh(): Promise<void>;
}

const EMPTY: Resource<never> = { value: null, loading: false, error: null };

/**
 * A value fetched for the signed-in person and workspace, fetched again when
 * either changes and when a Live notice of one of `notices` arrives (a type,
 * or a prefix ending in `.`).
 */
export function resource<T>(load: (client: Bridge) => Promise<T>, notices: readonly string[]): ResourceStore<T> {
	const state = writable<Resource<T>>(EMPTY);
	let client: Bridge | null = null;
	let key: string | null = null;
	let generation = 0;

	async function fetchNow(): Promise<void> {
		if (client === null || key === null) return;
		const mine = ++generation;
		const using = client;
		state.update((s) => ({ ...s, loading: true, error: null }));
		try {
			const value = await load(using);
			if (mine === generation) state.set({ value, loading: false, error: null });
		} catch (error) {
			if (mine === generation) state.update((s) => ({ ...s, loading: false, error }));
		}
	}

	const matches = (notice: LiveNotice) => notices.some((n) => (n.endsWith('.') ? notice.type.startsWith(n) : notice.type === n));

	const store = derived<Readable<Bridge | null>, Resource<T>>(
		bridgeClient,
		(current, set) => {
			client = current;
			key = null;
			if (current === null) {
				set(EMPTY);
				return;
			}
			const stopState = state.subscribe(set);
			const stopSession = current.session.subscribe((s) => {
				const next = s.status === 'signed-in' ? `${s.user.id}|${s.workspace?.id ?? ''}` : null;
				if (next === key) return;
				key = next;
				generation++;
				state.set(EMPTY);
				if (next !== null) void fetchNow();
			});
			const stopNotices = current.on('notice', (notice) => {
				if (key !== null && (matches(notice) || notice.type === MANY_CHANGED)) void fetchNow();
			});
			return () => {
				stopState();
				stopSession();
				stopNotices();
				client = null;
				key = null;
				generation++;
			};
		},
		EMPTY,
	);

	return { subscribe: store.subscribe, refresh: fetchNow };
}

/** The person's workspaces, with names and logos, for a chooser. */
export const workspaces: ResourceStore<readonly MyWorkspace[]> = resource((client) => client.workspaces.list(), ['accounts.']);

/** The signed-in person's profile. */
export const me: ResourceStore<Me> = resource((client) => client.me.get(), ['accounts.']);

/** The current workspace: its id and standing, with its name, logo and the person's role from their workspaces. */
export const workspace: Readable<(MyWorkspace & { readonly standing: string | null }) | null> = derived(
	[session, workspaces],
	([s, list]) => {
		if (s.status !== 'signed-in' || s.workspace === null) return null;
		const id = s.workspace.id;
		const found = list.value?.find((w) => w.id === id);
		return {
			id,
			name: found?.name ?? null,
			logo: found?.logo ?? null,
			member: found?.member ?? '',
			role: found?.role ?? '',
			status: found?.status ?? '',
			standing: s.workspace.standing,
		};
	},
);

/** The workspace's billing facts: plan, status, trial, limits and usage. For showing, never for gating. */
export const billing: ResourceStore<BillingFacts> = resource((client) => client.billing.state(), ['billing.']);

/** The plans on offer. */
export const plans: ResourceStore<readonly Plan[]> = resource((client) => client.billing.plans(), ['billing.']);

/** This period's usage of each metric, with its limit. */
export const usage: ResourceStore<UsageNumbers> = resource((client) => client.billing.usage(), ['billing.']);
