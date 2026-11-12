/**
 * Confirming it is you: the dialog an action that wants a recent sign-in
 * opens. `<BridgeBootstrap>` renders it. It is an overlay on the page the
 * person is on, never a navigation, so a form they were filling stays as it
 * was.
 *
 * ```ts
 * await withRecheck(() => createKey(form)); // asks once, if Bridge says so, then tries again
 * await confirmItIsYou();                   // or ask first, yourself
 * ```
 */
import { BridgeError } from '@nebulr-group/bridge-auth-core';
import { get, writable, type Readable } from 'svelte/store';
import { getBridge } from './client.js';

/** An open ask: the dialog settles it. */
export interface RecheckRequest {
	/** The person confirmed it is them. */
	readonly confirmed: () => void;
	/** The person cancelled, or the session ended. */
	readonly cancelled: () => void;
}

const current = writable<RecheckRequest | null>(null);
let pending: Promise<void> | null = null;

/** The open ask, or null. */
export const recheckRequest: Readable<RecheckRequest | null> = { subscribe: current.subscribe };

/**
 * Opens the dialog and resolves once the person confirmed it is them.
 * Rejects with `BridgeError` kind `cancelled` when they cancel. Calls made
 * while the dialog is open share it: one dialog, every waiting action goes on
 * once it is confirmed.
 */
export function confirmItIsYou(): Promise<void> {
	if (pending !== null) return pending;
	pending = new Promise<void>((resolve, reject) => {
		const settle = (done: () => void) => () => {
			pending = null;
			current.set(null);
			done();
		};
		current.set({
			confirmed: settle(resolve),
			cancelled: settle(() => reject(new BridgeError('cancelled', 'Confirming it is you was cancelled.'))),
		});
	});
	return pending;
}

/** Closes the dialog as cancelled, if it is open. */
export function cancelRecheck(): void {
	get(current)?.cancelled();
}

/**
 * Runs `action`. When Bridge answers that it needs a recent sign-in, asks the
 * person to confirm it is them (`confirmItIsYou`) and runs `action` once more.
 * A cancel, any other error and a second refusal are thrown.
 */
export function withRecheck<T>(action: () => Promise<T>): Promise<T> {
	return getBridge().recheck.guard(action, confirmItIsYou);
}
