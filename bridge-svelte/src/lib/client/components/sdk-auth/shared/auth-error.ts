/**
 * TBP-669 — what an SDK auth component shows when a Bridge call fails.
 *
 * Bridge refuses sign-in from an origin missing from the app's allowed origins
 * with `403 {"message":"Origin not allowed"}` — on password sign-in, on the
 * token exchange that finishes a magic-link or passkey sign-in, on MFA, signup
 * and passkey options. The components used to show that bare string (or, on
 * the magic-link path, nothing at all: see LoginForm's settling branch). A
 * developer could not tell it was a one-line fix in Bridge admin.
 *
 * Works with any auth-core in the peer range: auth-core versions with TBP-669
 * throw an error with `code: 'ORIGIN_NOT_ALLOWED'` and already log the console
 * line; older ones throw a plain `HttpError` (status 403, that message), which
 * is recognised here and logged here.
 */
import { en, type MessageKey, type Translator } from '@nebulr-group/bridge-auth-core';
import {
	ORIGIN_NOT_ALLOWED_DOCS_URL,
	originNotAllowedHint,
	pageOrigin,
} from '../../../../shared/allowed-origins.js';

// Present in auth-core's catalogues from TBP-669 on; English fallback before.
const ORIGIN_KEY = 'error.originNotAllowed';

/** True only for Bridge's origin-allowlist refusal — every other 403 keeps its own message. */
export function isOriginNotAllowed(err: unknown): boolean {
	if (!err || typeof err !== 'object') return false;
	const e = err as { code?: unknown; status?: unknown; message?: unknown; body?: unknown };
	if (e.code === 'ORIGIN_NOT_ALLOWED') return true;
	if (e.status !== 403) return false;
	const bodyMessage = (e.body as { message?: unknown } | undefined)?.message;
	const message = typeof bodyMessage === 'string' ? bodyMessage : e.message;
	return typeof message === 'string' && message.trim().toLowerCase() === 'origin not allowed';
}

/** The form copy: translated when the installed auth-core has the key, English otherwise. */
export function originNotAllowedMessage(t: Translator, origin: string | undefined = pageOrigin()): string {
	if (ORIGIN_KEY in en) return t(ORIGIN_KEY as MessageKey, { origin: origin ?? "this page's origin" });
	return originNotAllowedHint(origin);
}

const reported = new Set<string>();

/** One console line per origin per page load, unless auth-core already printed it. */
function reportOnce(err: unknown): void {
	if ((err as { code?: unknown }).code === 'ORIGIN_NOT_ALLOWED') return; // auth-core logged it
	const origin = pageOrigin();
	const key = origin ?? '';
	if (reported.has(key)) return;
	reported.add(key);
	console.error(`[bridge] Origin not allowed. ${originNotAllowedHint(origin)} Docs: ${ORIGIN_NOT_ALLOWED_DOCS_URL}`);
}

/** Test seam. */
export function _resetOriginReports(): void {
	reported.clear();
}

/**
 * The message an auth component shows for `err`: the origin fix for the
 * allowlist refusal, otherwise the error's own message, otherwise the
 * component's translated fallback.
 */
export function authErrorMessage(err: unknown, t: Translator, fallbackKey: MessageKey): string {
	if (isOriginNotAllowed(err)) {
		reportOnce(err);
		return originNotAllowedMessage(t);
	}
	const message = (err as { message?: unknown } | null)?.message;
	return typeof message === 'string' && message !== '' ? message : t(fallbackKey);
}
