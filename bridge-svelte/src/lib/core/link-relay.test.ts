/**
 * A sign-up's email link finishes in the tab it opens, which tells the tab
 * that started the sign-up, over a BroadcastChannel of the origin.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { announceSignUpFinished, onSignUpFinished } from './link-relay.js';

const ISSUER = 'https://bridge.test/identity-access/apps/app-1';
let stops: (() => void)[] = [];

afterEach(() => {
	for (const stop of stops) stop();
	stops = [];
});

const settle = () => new Promise((done) => setTimeout(done, 50));

describe('the finished sign-up announcement', () => {
	it('reaches the tab that started the sign-up, once', async () => {
		let heard = 0;
		stops.push(onSignUpFinished(ISSUER, () => (heard += 1)));
		announceSignUpFinished(ISSUER);
		announceSignUpFinished(ISSUER);
		await settle();
		expect(heard).toBe(1);
	});

	it('another issuer\'s tab never hears it', async () => {
		let heard = 0;
		stops.push(onSignUpFinished('https://bridge.test/identity-access/apps/other', () => (heard += 1)));
		announceSignUpFinished(ISSUER);
		await settle();
		expect(heard).toBe(0);
	});

	it('a stopped listener hears nothing', async () => {
		let heard = 0;
		const stop = onSignUpFinished(ISSUER, () => (heard += 1));
		stop();
		announceSignUpFinished(ISSUER);
		await settle();
		expect(heard).toBe(0);
	});
});
