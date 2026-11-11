/**
 * The pages `<BridgeAuthRoutes>` and `<BridgeBillingRoutes>` serve, from one
 * catch-all route each: `src/routes/auth/[...bridge]/+page.svelte` and
 * `src/routes/subscription/[...bridge]/+page.svelte`. The plugin owns the
 * list, so no page an email links to can be forgotten.
 */
import type { EmailLink } from '@nebulr-group/bridge-auth-core';

export const AUTH_PAGES = [
	'sign-in',
	'sign-up',
	'verify-email',
	'forgot-password',
	'set-password',
	'invite',
	'workspaces',
	'handoff',
	'magic-link',
	'passkey-setup',
] as const;

export type AuthPage = (typeof AUTH_PAGES)[number];

export const BILLING_PAGES = ['manage', 'plan', 'success', 'error'] as const;

export type BillingPage = (typeof BILLING_PAGES)[number];

/** The catch-all parameter's name: `[...bridge]`. */
export const ROUTE_PARAM = 'bridge';

/** The page for the rest of a catch-all path, or null for none of them. */
export function parseAuthPage(rest: string | null | undefined): AuthPage | null {
	const segments = (rest ?? '').split('/').filter((s) => s !== '');
	if (segments.length !== 1) return null;
	return (AUTH_PAGES as readonly string[]).includes(segments[0]) ? (segments[0] as AuthPage) : null;
}

/** The billing page for the rest of a catch-all path; the bare base is `manage`. */
export function parseBillingPage(rest: string | null | undefined): BillingPage | null {
	const segments = (rest ?? '').split('/').filter((s) => s !== '');
	if (segments.length === 0) return 'manage';
	if (segments.length !== 1) return null;
	return (BILLING_PAGES as readonly string[]).includes(segments[0]) ? (segments[0] as BillingPage) : null;
}

/** Whether a SvelteKit route id is a `[...bridge]` catch-all. */
export function isCatchAll(routeId: string | null | undefined): boolean {
	return typeof routeId === 'string' && routeId.endsWith(`/[...${ROUTE_PARAM}]`);
}

/** The page an email link opens. */
export function pageForLink(link: EmailLink): AuthPage {
	switch (link.kind) {
		case 'verify-email':
			return 'verify-email';
		case 'reset-password':
			return 'set-password';
		case 'invite':
			return 'invite';
		case 'magic-link':
			return 'magic-link';
		case 'passkey-setup':
			return 'passkey-setup';
	}
}

/** Whether `path` is `base` or under it. */
export function isUnder(path: string, base: string): boolean {
	if (base === '') return true;
	return path === base || path.startsWith(`${base}/`);
}

/** The auth page `path` is, under `authBase`, or null. */
export function authPageAt(path: string, authBase: string): AuthPage | null {
	if (!isUnder(path, authBase)) return null;
	return parseAuthPage(path.slice(authBase.length));
}
