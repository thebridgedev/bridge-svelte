import { getBridge } from './client.js';

/** What an email link is right now: it works, it was used, or it is past its time. */
export type LinkGate = 'open' | 'used' | 'expired';

/**
 * Looks at a link without using it: the page a link opens shows one button, and nothing is used up until the button is
 * pressed, so a mail scanner that opens the link first spoils nothing. When Bridge cannot answer (an issuer that does
 * not offer the preview, or no connection), the link is taken as open: pressing the button finds out for itself and
 * says so if the link is no good, so a link sent before the preview existed keeps working.
 */
export async function previewLink(token: string): Promise<LinkGate> {
	try {
		return (await getBridge().links.preview(token)).state;
	} catch {
		return 'open';
	}
}
