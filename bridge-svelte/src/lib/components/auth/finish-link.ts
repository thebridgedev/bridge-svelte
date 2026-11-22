/**
 * Bounds for the page that finishes a sign-up from its email link, so it
 * never waits without end: finishing has a time limit, and once signed in
 * the page goes on even when another navigation cancels its first try.
 */
import { BridgeError, passkeyHandOver } from '@nebulr-group/bridge-auth-core';

/** How long finishing a link may take before the page says it failed. */
export const FINISH_WAIT_MS = 30_000;

/**
 * How many times the page tries to go on once signed in. Signing in makes
 * the route guard run again as the session and the flags settle; SvelteKit
 * lets that newer navigation cancel the one going on.
 */
export const LEAVE_TRIES = 3;

/** `work`, or an `unavailable` error when it takes longer than `ms`. */
export function bounded<T>(work: Promise<T>, ms: number = FINISH_WAIT_MS): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new BridgeError('unavailable', 'Finishing the link took too long.')), ms);
		work.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error: unknown) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
}

/**
 * Navigates with `go` until `left` says the page was left: a navigation a
 * newer one cancelled still resolves, so only the address tells. True once
 * left; false after `tries`, and the page offers a link instead.
 */
export async function leave(go: () => Promise<unknown>, left: () => boolean, tries: number = LEAVE_TRIES): Promise<boolean> {
	for (let tried = 0; tried < tries; tried += 1) {
		try {
			await go();
		} catch {
			// A failed navigation is tried again like a cancelled one.
		}
		if (left()) return true;
	}
	return false;
}

/**
 * A sign-in finished for another app's sign-in request: the browser goes to
 * the app's registered return with the code, and this page makes no session.
 * True when it went.
 */
export function handOff(step: { readonly done: boolean; readonly handoff?: string; readonly confirmReturn?: true }, go: (url: string) => void = (url) => location.assign(url)): boolean {
	if (!step.done || step.handoff === undefined || step.confirmReturn === true) return false;
	go(step.handoff);
	return true;
}

/**
 * A sign-in that is done and goes back to the person's own machine (localhost) on an app in production: Bridge asks
 * for a click first, so the page shows a Continue button and goes back only when it is pressed. The address to go
 * back to, or null when the step holds none.
 */
export function heldReturn(step: { readonly done: boolean; readonly handoff?: string; readonly confirmReturn?: true }): string | null {
	return step.done && step.handoff !== undefined && step.confirmReturn === true ? step.handoff : null;
}

/** An address the Continue button may go to: http or https, with no credentials in it. */
export function safeReturn(url: string): string | null {
	try {
		const parsed = new URL(url);
		return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.username === '' && parsed.password === '' ? parsed.href : null;
	} catch {
		return null;
	}
}

/**
 * A passkey sign-in on Bridge's own pages that Bridge handed over to the app's sign-in page (a passkey belongs to the
 * app's own domain): goes there. True when it went. Only the person pressing the passkey button starts this: a wait for
 * the autofill list on Bridge's page never sends the browser away.
 */
export function continueOnAppPage(error: unknown, go: (url: string) => void = (url) => location.assign(url)): boolean {
	const to = passkeyHandOver(error);
	const safe = to === null ? null : safeReturn(to);
	if (safe === null) return false;
	go(safe);
	return true;
}
