/**
 * `bridgeFetch`: `fetch` for your own API, with the person's token.
 *
 * - It adds `Authorization: Bearer <access token>`, and after a 401 refreshes
 *   once and tries again.
 * - The token goes only to this page's origin, Bridge, and the
 *   `tokenOrigins` you list; any other address is refused before anything
 *   is sent.
 * - A 402 that is a plan limit or a missing plan feature opens the upgrade
 *   dialog. The response is returned as it came, either way.
 *
 * There is no global fetch patch: only calls made through this carry a token.
 */
import { getBridge } from './client.js';
import { openUpgrade, readPaymentRequired } from './upgrade.js';

export async function bridgeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const response = await getBridge().fetch(input, init);
	if (response.status === 402) {
		try {
			const request = readPaymentRequired(await response.clone().json());
			if (request !== null) openUpgrade(request);
		} catch {
			// Not JSON: not a refusal the dialog can explain.
		}
	}
	return response;
}
