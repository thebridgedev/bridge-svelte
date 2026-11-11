/**
 * The email-link page never waits without end: finishing has a time limit,
 * and a cancelled navigation after signing in is tried again.
 */
import { isBridgeError } from '@nebulr-group/bridge-auth-core';
import { describe, expect, it } from 'vitest';
import { bounded, handOff, leave } from './finish-link.js';

describe('finishing an email link', () => {
	it('gives the answer when it comes in time', async () => {
		await expect(bounded(Promise.resolve('done'), 1000)).resolves.toBe('done');
	});

	it('passes the error on', async () => {
		const failure = new Error('refused');
		await expect(bounded(Promise.reject(failure), 1000)).rejects.toBe(failure);
	});

	it('fails with unavailable when no answer comes', async () => {
		const error = await bounded(new Promise<never>(() => undefined), 20).catch((caught: unknown) => caught);
		expect(isBridgeError(error, 'unavailable')).toBe(true);
	});
});

describe('going on once signed in', () => {
	it('goes again when a newer navigation cancelled the first, which still resolved', async () => {
		let calls = 0;
		let here = '/auth/verify-email/';
		const go = async () => {
			calls += 1;
			if (calls > 1) here = '/';
		};
		await expect(leave(go, () => here !== '/auth/verify-email/')).resolves.toBe(true);
		expect(calls).toBe(2);
	});

	it('goes again after a navigation that failed', async () => {
		let calls = 0;
		const go = async () => {
			calls += 1;
			if (calls === 1) throw new Error('load failed');
		};
		await expect(leave(go, () => calls > 1)).resolves.toBe(true);
		expect(calls).toBe(2);
	});

	it('stops after its tries and says so', async () => {
		let calls = 0;
		const go = async () => {
			calls += 1;
		};
		await expect(leave(go, () => false, 3)).resolves.toBe(false);
		expect(calls).toBe(3);
	});
});

describe('a sign-in finished for another app\'s sign-in request', () => {
	it('sends the browser to the app\'s return, and only for a finished step that names one', () => {
		const went: string[] = [];
		const go = (url: string) => void went.push(url);
		expect(handOff({ done: true }, go)).toBe(false);
		expect(handOff({ done: false, handoff: 'https://app.test/callback?code=x' }, go)).toBe(false);
		expect(handOff({ done: true, handoff: 'https://app.test/callback?code=x&state=s&iss=i' }, go)).toBe(true);
		expect(went).toEqual(['https://app.test/callback?code=x&state=s&iss=i']);
	});
});
