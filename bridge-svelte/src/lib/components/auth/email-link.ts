/**
 * Email links land with their token in the fragment
 * (`#bridge=verify-email&token=…`), which never reaches a server log or a
 * Referer header. A page takes the token once and clears the fragment, so
 * the token does not stay in the address bar or the history.
 */
import { replaceState } from '$app/navigation';
import { page } from '$app/state';
import { readEmailLink, type EmailLink } from '@nebulr-group/bridge-auth-core';

export function takeEmailLink(kind: EmailLink['kind']): string | null {
	if (typeof window === 'undefined') return null;
	const link = readEmailLink(window.location.hash);
	if (link === null || link.kind !== kind) return null;
	const clean = `${window.location.pathname}${window.location.search}`;
	try {
		replaceState(clean, page.state);
	} catch {
		window.history.replaceState(window.history.state, '', clean);
	}
	return link.token;
}
