/**
 * `bridgeFetch`: `fetch` for your own API, with the person's token.
 *
 * - It adds `Authorization: Bearer <access token>`, and after a 401 refreshes
 *   once and tries again.
 * - The token goes only to this page's origin, Bridge, and the
 *   `tokenOrigins` you list; any other address is refused before anything
 *   is sent.
 * - A 402 that is a plan limit or a missing plan feature opens the upgrade
 *   dialog, when it came straight from your page's origin, your
 *   `tokenOrigins` or Bridge (never after a redirect). The response is
 *   returned as it came, either way.
 *
 * There is no global fetch patch: only calls made through this carry a token.
 */
import type { Bridge } from '@nebulr-group/bridge-auth-core';
import { getBridge, peekConfig } from './client.js';
import { openUpgrade, readPaymentRequired } from './upgrade.js';

function originOf(url: string): string | null {
	try {
		return new URL(url, typeof location === 'undefined' ? undefined : location.href).origin;
	} catch {
		return null;
	}
}

/**
 * Whether a 402 may open the upgrade dialog: it came, with no redirect on the
 * way, from this page's origin, one of the `tokenOrigins` your API runs on,
 * or Bridge. A response another host sent cannot put its text or its link in
 * a dialog inside your app.
 */
function mayExplain(bridge: Bridge, requested: string, response: Response): boolean {
	if (response.redirected) return false;
	const origin = originOf(response.url !== '' ? response.url : requested);
	if (origin === null) return false;
	const trusted = new Set<string>(peekConfig()?.tokenOrigins.map((o) => originOf(o) ?? '') ?? []);
	if (typeof location !== 'undefined') trusted.add(location.origin);
	try {
		for (const endpoint of Object.values(bridge.metadata().endpoints)) if (endpoint) trusted.add(originOf(endpoint) ?? '');
	} catch {
		// Not started yet: Bridge's own origins are not known, and nothing of Bridge's answered.
	}
	return trusted.has(origin);
}

export async function bridgeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const bridge = getBridge();
	const response = await bridge.fetch(input, init);
	const requested = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
	if (response.status === 402 && mayExplain(bridge, requested, response)) {
		try {
			const request = readPaymentRequired(await response.clone().json());
			if (request !== null) openUpgrade(request);
		} catch {
			// Not JSON: not a refusal the dialog can explain.
		}
	}
	return response;
}
