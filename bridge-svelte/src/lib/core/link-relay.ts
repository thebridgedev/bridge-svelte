/**
 * A sign-up's email link, handed to the tab that started the sign-up, for
 * apps that keep the session in memory (`storage: 'memory'`).
 *
 * A sign-up finishes only on the device that started it, with the PKCE
 * verifier it kept in localStorage. In memory mode the session lives in the
 * tab that started the sign-up, and the email link opens in a new one. The
 * new tab offers the link on a BroadcastChannel of the page's own origin;
 * the tab that started the sign-up takes it and finishes there, and the new
 * tab says so. When no tab takes it within a moment (it was closed, or the
 * browser put it to sleep), the new tab finishes itself with the stored
 * verifier. On another device there is none, and Bridge answers that the
 * link belongs to the device that started the sign-up; the link stays
 * usable there.
 *
 * Only the token crosses, only between tabs of the same origin, and never
 * through storage or an address.
 */

type Message = { readonly type: 'offer'; readonly id: string; readonly token: string } | { readonly type: 'taken'; readonly id: string };

/** How long a new tab waits for the tab that started the sign-up. */
export const OFFER_WAIT_MS = 1_500;

const channelOf = (issuer: string) => `bridge:${issuer.replace(/\/+$/, '')}:sign-up-link`;

let relayed: string | null = null;

/** Offers a sign-up link's token to the tab that started the sign-up. True when one took it. */
export function offerSignUpLink(issuer: string, token: string, waitMs = OFFER_WAIT_MS): Promise<boolean> {
	if (typeof BroadcastChannel === 'undefined') return Promise.resolve(false);
	const channel = new BroadcastChannel(channelOf(issuer));
	const id = crypto.randomUUID();
	return new Promise((done) => {
		const finish = (taken: boolean) => {
			clearTimeout(timer);
			channel.close();
			done(taken);
		};
		const timer = setTimeout(() => finish(false), waitMs);
		channel.onmessage = (event: MessageEvent<Message>) => {
			if (event.data?.type === 'taken' && event.data.id === id) finish(true);
		};
		channel.postMessage({ type: 'offer', id, token } satisfies Message);
	});
}

/**
 * While a sign-up started here waits for its email link: takes the link
 * another tab offers and calls `take` with it. Returns how to stop.
 */
export function takeSignUpLinks(issuer: string, take: () => void): () => void {
	if (typeof BroadcastChannel === 'undefined') return () => undefined;
	const channel = new BroadcastChannel(channelOf(issuer));
	channel.onmessage = (event: MessageEvent<Message>) => {
		const message = event.data;
		if (message?.type !== 'offer' || typeof message.token !== 'string' || message.token === '') return;
		relayed = message.token;
		channel.postMessage({ type: 'taken', id: message.id } satisfies Message);
		take();
	};
	return () => channel.close();
}

/** The link token another tab handed to this one, once. */
export function takeRelayedLink(): string | null {
	const token = relayed;
	relayed = null;
	return token;
}
