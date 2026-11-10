/**
 * The plugin's settings: the one required input is the issuer, the address
 * from the app's settings in Bridge. Everything else has a default.
 */
import type { Hint, MessageOverrides } from '@nebulr-group/bridge-auth-core';
import { STANDARD_FLAGS } from '@nebulr-group/bridge-auth-core';
import type { Component } from 'svelte';
import type { PluginMessageKey } from './messages.js';
import type { UpgradeDialogProps } from './upgrade.js';

/** Which flags a route needs: one, any of several, or all of several. */
export type FlagRequirement = string | { readonly any: readonly string[] } | { readonly all: readonly string[] };

/** One route rule. The first rule whose `match` fits the path decides. */
export interface RouteRule {
	/** An exact path, a path with `*` wildcards (`/docs/*`), or a RegExp. */
	readonly match: string | RegExp;
	/** Open to visitors. Without it, `defaultAccess` decides. */
	readonly public?: boolean;
	/**
	 * Flags the route needs. A flag's rule says why it is on: a privilege, a
	 * plan feature or a rollout, so this is how a page is gated on any of them.
	 */
	readonly featureFlag?: FlagRequirement;
	/** Where to send the person when a flag is off. @default the app's home after sign-in */
	readonly redirectTo?: string;
}

/** Copy overrides, for the plugin's own keys as well as the shared ones. */
export type BridgeMessages = MessageOverrides & Partial<Record<PluginMessageKey, string>>;

export interface BridgeConfig {
	/**
	 * The issuer: copy it from the app's settings in Bridge. Every endpoint is
	 * read from it. @default the `PUBLIC_BRIDGE_ISSUER` environment variable
	 */
	readonly issuer?: string;
	/** Route rules, first match wins. */
	readonly rules?: readonly RouteRule[];
	/** Whether a route no rule matches needs a signed-in person. @default 'protected' */
	readonly defaultAccess?: 'protected' | 'public';
	readonly auth?: {
		/** Where `<BridgeAuthRoutes>` is mounted. @default '/auth' */
		readonly base?: string;
		/** Where a person lands after signing in, when no return address was kept. @default '/' */
		readonly afterSignIn?: string;
		/** Where a person lands after signing out. @default the sign-in page */
		readonly afterSignOut?: string;
	};
	/** The query parameter that carries the page to return to after sign-in. @default 'redirectUri' */
	readonly returnToParam?: string;
	/** The language of the sign-in pages: one of the 12 shipped, such as `de` or `sv-SE`. @default 'en' */
	readonly locale?: string;
	/** Your own wording for any message key. */
	readonly messages?: BridgeMessages;
	/**
	 * Other origins `bridgeFetch` may send the person's token to, such as your
	 * API on its own host (`https://api.example.com`). The page's own origin
	 * and Bridge are always allowed; nothing else is.
	 */
	readonly tokenOrigins?: readonly string[];
	/** Live updates: flags, team and billing refresh within a second of a change. @default true */
	readonly live?: boolean;
	/**
	 * Where the session is kept between page loads.
	 *
	 * - `'local'`: in the browser's localStorage, so a reload and a new tab
	 *   stay signed in.
	 * - `'memory'`: in this page's memory only. The refresh token and the
	 *   visitor id are never written to localStorage or sessionStorage. A
	 *   reload signs in again. A new tab is signed in by another open tab of
	 *   the app, passed in memory only; with no other tab open, it signs in
	 *   again. The one exception is a sign-up waiting for its email link: its
	 *   PKCE verifier is kept in localStorage, so the link, which opens in a
	 *   new tab, finishes the sign-up in this browser even after the tab that
	 *   started it is closed. It is kept for the link's 15 minutes at most and
	 *   removed once used; on another device the link is refused. When the
	 *   tab that started the sign-up is still open, the link is handed to it
	 *   and finishes there.
	 *
	 * @default 'local'
	 */
	readonly storage?: 'local' | 'memory';
	/** Hints flag rules may read, such as a country or a page. Who the person is always comes from their token. */
	readonly hints?: Readonly<Record<string, Hint>>;
	/**
	 * The flags the plugin's own screens gate on. Bridge keeps three standard
	 * flags for every app; name your own here to use those instead.
	 */
	readonly flags?: {
		/** May choose a plan and open the billing portal. @default 'bridge-billing-manage' */
		readonly billingManage?: string;
		/** May invite, change roles and remove members. @default 'bridge-team-manage' */
		readonly teamManage?: string;
		/** The app is active for this workspace; off means the paywall. @default 'bridge-app-active' */
		readonly appActive?: string;
	};
	readonly billing?: {
		/** Where `<BridgeBillingRoutes>` is mounted. @default '/subscription' */
		readonly base?: string;
		/**
		 * Where a signed-in person goes while `appActive` is off, or `false` for
		 * no paywall. @default the plan page under `base`
		 */
		readonly paywall?: string | false;
		/**
		 * The dialog a plan limit opens (a 402 from your API, or an upgrade
		 * prompt). `false` for none, or your own component. @default true
		 */
		readonly upgradeDialog?: boolean | Component<UpgradeDialogProps>;
	};
	/**
	 * Hand-off mode, for a sign-in page that signs a person in for a program
	 * on their own machine, such as a command-line tool. Off unless set.
	 */
	readonly handoff?: {
		/** Return the code to the program's loopback address (`http://127.0.0.1:<port>`). */
		readonly loopback: true;
		/** The program's name, for the page's copy. @default 'the command-line tool' */
		readonly program?: string;
	};
}

/** The settings with every default filled in. */
export interface ResolvedConfig {
	readonly issuer: string;
	readonly rules: readonly RouteRule[];
	readonly defaultAccess: 'protected' | 'public';
	readonly authBase: string;
	readonly afterSignIn: string;
	readonly afterSignOut: string;
	readonly returnToParam: string;
	readonly locale: string | undefined;
	readonly messages: BridgeMessages;
	readonly tokenOrigins: readonly string[];
	readonly live: boolean;
	readonly storage: 'local' | 'memory';
	readonly hints: Readonly<Record<string, Hint>> | undefined;
	readonly flagKeys: { readonly billingManage: string; readonly teamManage: string; readonly appActive: string };
	readonly billingBase: string;
	readonly paywall: string | null;
	readonly upgradeDialog: boolean | Component<UpgradeDialogProps>;
	readonly handoff: { readonly program: string } | null;
}

/** A path without a trailing slash, `''` for the root. */
function base(path: string | undefined, fallback: string): string {
	const value = (path ?? fallback).trim();
	if (!value.startsWith('/')) throw new Error(`[bridge] A route base must start with "/"; got "${value}".`);
	return value.replace(/\/+$/, '');
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Checks the issuer before anything is sent: it must be https, except on
 * this machine (`http://localhost`, `127.0.0.1` or `[::1]`) for development.
 */
export function checkIssuer(issuer: string | undefined): string {
	if (typeof issuer !== 'string' || issuer.trim() === '') {
		throw new Error(
			'[bridge] No issuer. Set PUBLIC_BRIDGE_ISSUER to the issuer from your app\'s settings in Bridge, or pass `issuer` to bridgeBootstrap().',
		);
	}
	let url: URL;
	try {
		url = new URL(issuer.trim());
	} catch {
		throw new Error(`[bridge] The issuer "${issuer}" is not an address.`);
	}
	const secure = url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.has(url.hostname));
	if (!secure) {
		throw new Error(`[bridge] The issuer must be an https address (http only on localhost); got "${issuer}".`);
	}
	if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
		throw new Error(`[bridge] The issuer must be a plain address, with no credentials, query or fragment; got "${issuer}".`);
	}
	// Passed on exactly as given: the issuer's metadata must name the same string.
	return issuer.trim();
}

function storageOf(value: BridgeConfig['storage']): 'local' | 'memory' {
	if (value === undefined || value === 'local' || value === 'memory') return value ?? 'local';
	throw new Error(`[bridge] storage is 'local' or 'memory'; got "${String(value)}".`);
}

export function resolveConfig(config: BridgeConfig, envIssuer: string | undefined): ResolvedConfig {
	const authBase = base(config.auth?.base, '/auth');
	const billingBase = base(config.billing?.base, '/subscription');
	const paywall = config.billing?.paywall;
	return {
		issuer: checkIssuer(config.issuer ?? envIssuer),
		rules: config.rules ?? [],
		defaultAccess: config.defaultAccess ?? 'protected',
		authBase,
		afterSignIn: config.auth?.afterSignIn ?? '/',
		afterSignOut: config.auth?.afterSignOut ?? `${authBase}/sign-in`,
		returnToParam: config.returnToParam ?? 'redirectUri',
		locale: config.locale,
		messages: config.messages ?? {},
		tokenOrigins: config.tokenOrigins ?? [],
		live: config.live ?? true,
		storage: storageOf(config.storage),
		hints: config.hints,
		flagKeys: {
			billingManage: config.flags?.billingManage ?? STANDARD_FLAGS.billingManage,
			teamManage: config.flags?.teamManage ?? STANDARD_FLAGS.teamManage,
			appActive: config.flags?.appActive ?? STANDARD_FLAGS.appActive,
		},
		billingBase,
		paywall: paywall === false ? null : (paywall ?? `${billingBase}/plan`),
		upgradeDialog: config.billing?.upgradeDialog ?? true,
		handoff: config.handoff?.loopback === true ? { program: config.handoff.program ?? 'the command-line tool' } : null,
	};
}
