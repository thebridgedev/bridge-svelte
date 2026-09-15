/**
 * TBP-669 — the app's allowed origins in Bridge, from the SDK's side: where a
 * developer fixes a missing origin, and the one sentence that says so. Shared
 * by the auth components (sign-in refused) and the realtime status / dev
 * badge (subscription refused), so both name the same fix.
 */

/** Where a Bridge admin adds an origin — the admin UI's own labels, which are English. */
export const ALLOWED_ORIGINS_ADMIN_PATH = 'Authentication → Security → Allowed Origins';

/** Docs entry for `origin_not_allowed` — the same anchor auth-core's realtime client links. */
export const ORIGIN_NOT_ALLOWED_DOCS_URL = 'https://thebridge.dev/docs/live-updates/troubleshooting/#origin_not_allowed';

/** The page's origin, or undefined outside a browser. */
export function pageOrigin(): string | undefined {
	const origin = (globalThis as { location?: { origin?: unknown } }).location?.origin;
	return typeof origin === 'string' && origin !== '' && origin !== 'null' ? origin : undefined;
}

/** English fix sentence. */
export function originNotAllowedHint(origin: string | undefined = pageOrigin()): string {
	return `This app's allowed origins in Bridge don't include ${origin ?? "this page's origin"} — add it in Bridge admin under ${ALLOWED_ORIGINS_ADMIN_PATH}.`;
}
