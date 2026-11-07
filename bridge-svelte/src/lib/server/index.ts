/**
 * @nebulr-group/bridge-svelte/server
 *
 * For your SvelteKit server: check the token a request carries, read flag
 * results for the caller, and count usage ("count this"). Import it only from
 * `hooks.server.ts`, `+server.ts` and `+page.server.ts`; it refuses to load in
 * a browser, so the app key never reaches a page.
 *
 * ```ts
 * // src/hooks.server.ts
 * import { env } from '$env/dynamic/private';
 * import { env as pub } from '$env/dynamic/public';
 * import { bridgeHandle } from '@nebulr-group/bridge-svelte/server';
 * export const handle = bridgeHandle({ issuer: pub.PUBLIC_BRIDGE_ISSUER, appKey: env.BRIDGE_APP_KEY });
 *
 * // src/routes/api/reports/+server.ts
 * import { requireActor, meter } from '@nebulr-group/bridge-svelte/server';
 * export const POST = async (event) => {
 *   const actor = requireActor(event);
 *   meter(event, 'reports');
 *   ...
 * };
 * ```
 *
 * Token checks follow the app's revocation list, so a session that ended or
 * a member who was removed is refused within seconds. While Bridge cannot be
 * checked, the answer is 503, never yes.
 */
import { error, json, type Handle, type RequestEvent } from '@sveltejs/kit';
import {
	createBridgeServer,
	FlagSet,
	type Actor,
	type BridgeServer,
	type BridgeServerOptions,
	type Hint,
} from '@nebulr-group/bridge-auth-core/server';

export type { Actor, BridgeServerOptions };
export { FlagSet };

/** What `bridgeHandle` puts on `event.locals.bridge`. */
export interface BridgeLocals {
	/** Who called: the person or key behind the request's credential, or null when it carried none. */
	readonly actor: Actor | null;
	/** The caller's flag results, worked out by Bridge. Fetched once per request, when first asked. */
	flags(hints?: Readonly<Record<string, Hint>>): Promise<FlagSet>;
	/** Counts usage of a metric for the caller's workspace ("count this"). */
	meter(metric: string, quantity?: number, options?: { readonly id?: string; readonly workspace?: string }): void;
	/** The server client, for anything else. */
	readonly server: BridgeServer;
}

export interface BridgeHandleOptions extends BridgeServerOptions {
	/**
	 * Check writes strictly: refuse unless the revocation list is at most 30
	 * seconds behind. @default true for POST, PUT, PATCH and DELETE
	 */
	readonly strictWrites?: boolean;
}

const servers = new Map<string, BridgeServer>();

/** One server client per issuer and key, for the life of the process. */
function serverFor(options: BridgeServerOptions): BridgeServer {
	const id = `${options.issuer}|${options.appKey ?? ''}`;
	let server = servers.get(id);
	if (server === undefined) {
		server = createBridgeServer(options);
		// A failed first start is retried by the client; never an unhandled rejection.
		server.ready.catch(() => undefined);
		servers.set(id, server);
		const proc = (globalThis as { process?: { once?: (event: string, fn: () => void) => void } }).process;
		const closing = server;
		proc?.once?.('sveltekit:shutdown', () => void closing.close());
	}
	return server;
}

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function carriesCredential(request: Request): boolean {
	return request.headers.has('authorization') || request.headers.has('x-api-key');
}

function refusal(status: number, detail: string): Response {
	const headers: Record<string, string> = { 'content-type': 'application/problem+json' };
	if (status === 401) headers['www-authenticate'] = 'Bearer';
	if (status === 503) headers['retry-after'] = '5';
	return json({ type: 'about:blank', title: status === 401 ? 'Unauthorized' : 'Service Unavailable', status, detail }, { status, headers });
}

/**
 * The `handle` for `hooks.server.ts`. A request that carries a credential is
 * checked before any route runs: a bad or ended one is answered 401, and one
 * that cannot be checked right now 503. A request with none goes on with
 * `actor: null`; protect a route with `requireActor`.
 */
export function bridgeHandle(options: BridgeHandleOptions): Handle {
	const { strictWrites = true, ...serverOptions } = options;
	const server = serverFor(serverOptions);
	return async ({ event, resolve }) => {
		let actor: Actor | null = null;
		if (carriesCredential(event.request)) {
			const strict = strictWrites && WRITES.has(event.request.method);
			const checked = await server.check(event.request, { strict });
			if (!checked.ok) return refusal(checked.error.status === 503 ? 503 : 401, checked.error.message);
			actor = checked.actor;
		}
		let flags: Promise<FlagSet> | null = null;
		const locals: BridgeLocals = {
			actor,
			server,
			flags(hints) {
				flags ??= server.flags.forRequest(event.request, hints).catch(() => new FlagSet());
				return flags;
			},
			meter(metric, quantity, countOptions) {
				if (actor === null) throw new Error('[bridge] meter() needs a signed-in caller: check with requireActor first.');
				server.usage.count(actor, metric, quantity, countOptions);
			},
		};
		(event.locals as { bridge?: BridgeLocals }).bridge = locals;
		return resolve(event);
	};
}

function localsOf(event: Pick<RequestEvent, 'locals'>): BridgeLocals {
	const locals = (event.locals as { bridge?: BridgeLocals }).bridge;
	if (locals === undefined) throw new Error('[bridge] No Bridge on this request. Add `export const handle = bridgeHandle({ ... })` to hooks.server.ts.');
	return locals;
}

/** The caller, or a 401 when the request carried no credential. */
export function requireActor(event: Pick<RequestEvent, 'locals'>): Actor {
	const { actor } = localsOf(event);
	if (actor === null) error(401, 'Sign in first.');
	return actor;
}

/** Counts usage of a metric for the caller's workspace ("count this"). Needs the app key in `bridgeHandle`. */
export function meter(
	event: Pick<RequestEvent, 'locals'>,
	metric: string,
	quantity?: number,
	options?: { readonly id?: string; readonly workspace?: string },
): void {
	localsOf(event).meter(metric, quantity, options);
}

/** The caller's flag results. A request without a person's token gets every flag's fallback. */
export function flagsFor(event: Pick<RequestEvent, 'locals'>, hints?: Readonly<Record<string, Hint>>): Promise<FlagSet> {
	return localsOf(event).flags(hints);
}
