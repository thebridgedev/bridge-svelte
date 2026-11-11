/**
 * `bridgeBootstrap`: the root layout's load function. It makes the page's
 * Bridge client, sends email links to their pages, and guards every
 * navigation.
 *
 * ```ts
 * // src/routes/+layout.ts
 * import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';
 * export const ssr = false;
 * export const load = bridgeBootstrap({ rules: [{ match: '/', public: true }] });
 * ```
 */
import { error, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { readEmailLink, readReturnTo, type Bridge } from '@nebulr-group/bridge-auth-core';
import { get } from 'svelte/store';
import { startClient } from './core/client.js';
import { resolveConfig, type BridgeConfig, type ResolvedConfig } from './core/config.js';
import { decide, normalizePath, type GuardDecision } from './core/guard.js';
import { authPageAt, isCatchAll, isUnder, pageForLink, parseBillingPage, ROUTE_PARAM } from './core/routes.js';

/** What the root layout's load gives every page. */
export interface BridgeLayoutData {
	/** The page's Bridge client. */
	readonly bridge: Bridge;
}

/** The parts of a SvelteKit load event bridgeBootstrap reads. */
export interface BridgeLoadEvent {
	readonly url: URL;
	readonly params: Partial<Record<string, string>>;
	readonly route: { readonly id: string | null };
	depends(...deps: `${string}:${string}`[]): void;
}

/** Load dependencies `<BridgeBootstrap>` invalidates, so the guard runs again. */
export const SESSION_DEPENDENCY = 'bridge:session';
export const FLAGS_DEPENDENCY = 'bridge:flags';

/** How long a navigation waits for Bridge before deciding as if nobody were signed in. */
const READY_WAIT_MS = 8000;

function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve(undefined), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			() => {
				clearTimeout(timer);
				resolve(undefined);
			},
		);
	});
}

/** Sends the browser on, keeping the email link's fragment. */
function followLink(config: ResolvedConfig, url: URL): void {
	if (typeof window === 'undefined') return;
	const hash = window.location.hash;
	const link = readEmailLink(hash);
	if (link === null) return;
	const page = `${config.authBase}/${pageForLink(link)}`;
	if (normalizePath(url.pathname) === page) return;
	redirect(307, `${page}${hash}`);
}

async function guard(client: Bridge, config: ResolvedConfig, url: URL): Promise<GuardDecision> {
	await within(client.ready, READY_WAIT_MS);
	const flagsNeeded = authPageAt(normalizePath(url.pathname), config.authBase) === null;
	if (flagsNeeded && get(client.flags.status) !== 'ready') await within(client.flags.load(), READY_WAIT_MS);
	return decide(config, {
		path: url.pathname,
		target: `${normalizePath(url.pathname)}${url.search}`,
		session: client.session.get(),
		flags: client.flags,
		returnTo: readReturnTo(url, config.returnToParam),
	});
}

/**
 * Makes the root layout's load function. Set `export const ssr = false`
 * next to it: the client runs in the browser.
 */
export function bridgeBootstrap(options: BridgeConfig = {}) {
	return async function load(event: BridgeLoadEvent): Promise<BridgeLayoutData> {
		if (typeof window === 'undefined') {
			throw new Error('[bridge] bridgeBootstrap runs in the browser. Add `export const ssr = false` to your root +layout.ts.');
		}
		event.depends(SESSION_DEPENDENCY, FLAGS_DEPENDENCY);
		const config = resolveConfig(options, env.PUBLIC_BRIDGE_ISSUER);
		const client = startClient(config);
		const { url } = event;
		// Matched as the router resolves the route: decoded, without a trailing slash.
		const path = normalizePath(url.pathname);

		// A sign-in request in the address is taken once, then the same page is loaded without it, so the address the
		// navigation ends on never shows it: while it is unspent, anyone holding it could sign in on it.
		if (config.signInRequests && url.searchParams.has('request')) {
			await client.request.use(url.searchParams.get('request') ?? '').catch(() => undefined);
			const clean = new URL(url);
			clean.searchParams.delete('request');
			redirect(307, `${clean.pathname}${clean.search}${clean.hash}`);
		}

		// An email link lands on the email-links address with its token in the fragment: on to its page.
		followLink(config, url);
		if (config.authBase !== '' && path === config.authBase) redirect(307, `${config.authBase}/sign-in${url.search}`);

		// A catch-all route under the auth or billing base answers an unknown page with the app's own 404.
		if (isCatchAll(event.route.id)) {
			const rest = event.params[ROUTE_PARAM];
			if (isUnder(path, config.authBase) && authPageAt(path, config.authBase) === null) error(404, 'Not found');
			if (isUnder(path, config.billingBase) && parseBillingPage(rest) === null) error(404, 'Not found');
		}

		const decision = await guard(client, config, url);
		switch (decision.type) {
			case 'sign-in':
			case 'redirect':
				redirect(307, decision.to);
			// eslint-disable-next-line no-fallthrough
			case 'forbidden':
				error(403, 'Forbidden');
			// eslint-disable-next-line no-fallthrough
			case 'allow':
				return { bridge: client };
		}
	};
}
