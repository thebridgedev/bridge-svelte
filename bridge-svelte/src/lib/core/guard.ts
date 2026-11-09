/**
 * The route guard. It reads who is signed in and flag results, nothing else:
 * never a role, a privilege or the plan. A page that only some people may
 * see names a flag, and the flag's rule says who (a privilege, a plan feature
 * or a rollout).
 *
 * It fails closed: while Bridge cannot be reached, a protected page sends
 * the visitor to sign-in, and a flag that has no result is off.
 */
import { sanitizeReturnTo, withReturnTo, type SessionState } from '@nebulr-group/bridge-auth-core';
import type { FlagRequirement, ResolvedConfig, RouteRule } from './config.js';
import { authPageAt, isUnder, type AuthPage } from './routes.js';

export type GuardDecision =
	| { readonly type: 'allow' }
	| { readonly type: 'sign-in'; readonly to: string }
	| { readonly type: 'redirect'; readonly to: string; readonly reason: 'flag' | 'paywall' | 'signed-in' }
	| { readonly type: 'forbidden' };

/** Reads flags for the guard: whether one is on. */
export interface FlagReader {
	enabled(key: string): boolean;
}

function toRegExp(match: string | RegExp): RegExp {
	if (match instanceof RegExp) return match;
	const escaped = match.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`^${escaped.replace(/\*/g, '.*')}$`);
}

/**
 * The path as SvelteKit resolves the route: decoded the way SvelteKit decodes
 * it (`%25` kept, so nothing is decoded twice), without a trailing slash
 * (`/` itself stays). The guard matches rules against this, so `/reports/`
 * and `/%72eports` are the same page as `/reports`, as they are for the router.
 * A path that cannot be decoded is kept as given; no rule matches it and
 * `defaultAccess` decides.
 */
export function normalizePath(pathname: string): string {
	let path = pathname;
	try {
		path = pathname.split('%25').map(decodeURI).join('%25');
	} catch {
		path = pathname;
	}
	if (path.length > 1 && path.endsWith('/')) path = path.replace(/\/+$/, '') || '/';
	return path;
}

/** The first rule that matches `path`, or null. */
export function findRule(path: string, rules: readonly RouteRule[]): RouteRule | null {
	for (const rule of rules) {
		const pattern = toRegExp(rule.match);
		pattern.lastIndex = 0;
		if (pattern.test(path)) return rule;
	}
	return null;
}

/** Whether every flag a requirement names is on (or, for `any`, one of them). */
export function flagsAllow(requirement: FlagRequirement, flags: FlagReader): boolean {
	if (typeof requirement === 'string') return flags.enabled(requirement);
	if ('any' in requirement) return requirement.any.some((key) => flags.enabled(key));
	return requirement.all.length > 0 && requirement.all.every((key) => flags.enabled(key));
}

/** Auth pages a signed-in person is sent on from, to where they were going. */
const SIGNED_IN_SKIPS: ReadonlySet<AuthPage> = new Set(['sign-in', 'sign-up']);

export interface GuardInput {
	readonly path: string;
	/** The path with its query, to come back to after signing in. */
	readonly target: string;
	readonly session: SessionState;
	readonly flags: FlagReader;
	/** The return address already on the URL, on an auth page. */
	readonly returnTo: string | null;
}

/** Decides one navigation. */
export function decide(config: ResolvedConfig, given: GuardInput): GuardDecision {
	const input = { ...given, path: normalizePath(given.path) };
	const signedIn = input.session.status === 'signed-in';
	const authPage = authPageAt(input.path, config.authBase);
	if (authPage !== null) {
		if (signedIn && SIGNED_IN_SKIPS.has(authPage)) {
			return { type: 'redirect', to: sanitizeReturnTo(input.returnTo) ?? config.afterSignIn, reason: 'signed-in' };
		}
		return { type: 'allow' };
	}

	const rule = findRule(input.path, config.rules);
	const isPublic = rule?.public ?? config.defaultAccess === 'public';
	if (!isPublic && !signedIn) {
		return { type: 'sign-in', to: withReturnTo(`${config.authBase}/sign-in`, input.target, config.returnToParam) };
	}

	if (rule?.featureFlag !== undefined && !flagsAllow(rule.featureFlag, input.flags)) {
		const to = rule.redirectTo ?? (signedIn ? config.afterSignIn : `${config.authBase}/sign-in`);
		if (to === input.path) return { type: 'forbidden' };
		return { type: 'redirect', to, reason: 'flag' };
	}

	const billingPage = isUnder(input.path, config.billingBase);
	if (signedIn && !isPublic && !billingPage && config.paywall !== null && !input.flags.enabled(config.flagKeys.appActive)) {
		if (config.paywall === input.path) return { type: 'allow' };
		return { type: 'redirect', to: withReturnTo(config.paywall, input.target, config.returnToParam), reason: 'paywall' };
	}

	return { type: 'allow' };
}
