/**
 * Memory mode: a sign-up's email link opens in a new tab and is handed to
 * the tab that started the sign-up, over a BroadcastChannel of the origin.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { offerSignUpLink, takeRelayedLink, takeSignUpLinks } from './link-relay.js';

const ISSUER = 'https://bridge.test/identity-access/apps/app-1';
let stops: (() => void)[] = [];

afterEach(() => {
	for (const stop of stops) stop();
	stops = [];
	takeRelayedLink();
});

describe('the sign-up link relay', () => {
	it('the tab that started the sign-up takes the link, once', async () => {
		let taken = 0;
		stops.push(takeSignUpLinks(ISSUER, () => (taken += 1)));
		await expect(offerSignUpLink(ISSUER, 'link-token', 1000)).resolves.toBe(true);
		expect(taken).toBe(1);
		expect(takeRelayedLink()).toBe('link-token');
		expect(takeRelayedLink()).toBeNull();
	});

	it('with no such tab, the offer lapses and the new tab goes on alone', async () => {
		await expect(offerSignUpLink(ISSUER, 'link-token', 50)).resolves.toBe(false);
		expect(takeRelayedLink()).toBeNull();
	});

	it('another issuer\'s tab never takes it', async () => {
		let taken = 0;
		stops.push(takeSignUpLinks('https://bridge.test/identity-access/apps/other', () => (taken += 1)));
		await expect(offerSignUpLink(ISSUER, 'link-token', 50)).resolves.toBe(false);
		expect(taken).toBe(0);
	});

	it('a stopped listener takes nothing', async () => {
		const stop = takeSignUpLinks(ISSUER, () => undefined);
		stop();
		await expect(offerSignUpLink(ISSUER, 'link-token', 50)).resolves.toBe(false);
	});
});
