/**
 * Whether the workspace is locked for payment, as a store. The lock is Bridge's: a locked workspace can be read but not
 * changed. It is read when the page starts and again when Bridge says access changed, and a 402 for the lock that your
 * own API answers through `bridgeFetch` shows it at once.
 */
import type { Bridge, BillingGateState } from '@nebulr-group/bridge-auth-core';
import { derived, type Readable } from 'svelte/store';
import { bridgeClient } from './client.js';

const OPEN: BillingGateState = Object.freeze({ locked: false, severity: 'info', noticeState: 'active' });

/** The lock: `{ locked, severity, noticeState, recoveryUrl }`. Not locked until Bridge says so. */
export const billingGate: Readable<BillingGateState> = derived<Readable<Bridge | null>, BillingGateState>(
	bridgeClient,
	(client, set) => {
		if (client === null) {
			set(OPEN);
			return;
		}
		set(client.gateState());
		return client.on('gate-changed', set);
	},
	OPEN,
);

/** Whether the workspace is locked for payment, as a store. */
export const billingLocked: Readable<boolean> = derived(billingGate, (gate) => gate.locked);
