/**
 * A sign-up's email link, and the tab that started the sign-up.
 *
 * A sign-up finishes only in the browser that started it, with the PKCE
 * verifier it kept in localStorage while the email was on the way. The link
 * opens in a new tab, which finishes the sign-up and signs in right there,
 * whichever storage the app uses. It then tells the other tabs of the
 * origin, on a BroadcastChannel, that the sign-up is finished, so the tab
 * that started it does not keep waiting: it goes on signed in when the
 * session reached it too, and otherwise says where the person is signed in.
 * In another browser or on another device there is no verifier, and Bridge
 * answers that the link belongs to the browser that started the sign-up;
 * the link stays usable there.
 *
 * Only the fact that a sign-up finished crosses, only between tabs of the
 * same origin: never a token, an address or a name.
 */

type Message = { readonly type: 'finished' };

const channelOf = (issuer: string) => `bridge:${issuer.replace(/\/+$/, '')}:sign-up-link`;

/** Tells the other tabs of this origin that a sign-up finished here. */
export function announceSignUpFinished(issuer: string): void {
	if (typeof BroadcastChannel === 'undefined') return;
	const channel = new BroadcastChannel(channelOf(issuer));
	channel.postMessage({ type: 'finished' } satisfies Message);
	channel.close();
}

/**
 * While a sign-up started here waits for its email link: calls `then` once
 * another tab of this origin finished a sign-up. Returns how to stop.
 */
export function onSignUpFinished(issuer: string, then: () => void): () => void {
	if (typeof BroadcastChannel === 'undefined') return () => undefined;
	const channel = new BroadcastChannel(channelOf(issuer));
	channel.onmessage = (event: MessageEvent<Message>) => {
		if (event.data?.type !== 'finished') return;
		channel.close();
		then();
	};
	return () => channel.close();
}
