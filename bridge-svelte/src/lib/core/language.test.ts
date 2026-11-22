import { afterEach, describe, expect, it } from 'vitest';
import { memoryStorage } from '@nebulr-group/bridge-auth-core';
import { createFakeIssuer } from '@nebulr-group/bridge-auth-core/testing';
import { resetClient, startClient } from './client.js';
import { resolveConfig, type BridgeConfig } from './config.js';
import { screenLanguage, setAppCopy } from './i18n.js';

/** Sign-up, sign-in link, recovery and passkey setup emails come in the language of the screen that asked. */

function clientFor(config: BridgeConfig) {
	const fake = createFakeIssuer({ methods: ['password', 'magicLink', 'passkeys'] });
	fake.addPerson({ email: 'alice@acme.test', password: 'correct horse battery', workspaces: [{ id: 'ws', name: 'Acme' }] });
	const client = startClient(resolveConfig({ issuer: fake.issuer, ...config }, undefined), { fetch: fake.fetch, storage: memoryStorage(), autoRefresh: false, locks: null, tabChannel: null, live: false });
	return { fake, client };
}

afterEach(() => {
	resetClient();
	setAppCopy(undefined, {});
});

describe('the screens\' language goes with the emails they ask for', () => {
	it('sends the app\'s locale with recovery, sign-in link and sign-up', async () => {
		const { fake, client } = clientFor({ locale: 'da' });
		await client.password.forgot('alice@acme.test');
		await client.magicLink.start('alice@acme.test');
		await client.signUp.start({ email: 'new@acme.test', password: 'correct horse battery' });
		expect(fake.sentLinks.map((link) => [link.purpose, link.language])).toEqual([
			['reset-password', 'da'],
			['magic-link', 'da'],
			['verify-sign-up', 'da'],
		]);
	});

	it('sends a regional locale as given, and English for screens with no locale', async () => {
		const swedish = clientFor({ locale: 'sv-SE' });
		await swedish.client.password.forgot('alice@acme.test');
		expect(swedish.fake.sentLinks.at(-1)?.language).toBe('sv-SE');
		resetClient();
		const plain = clientFor({});
		await plain.client.password.forgot('alice@acme.test');
		expect(plain.fake.sentLinks.at(-1)?.language).toBe('en');
	});

	it('follows the app\'s language when it changes', () => {
		setAppCopy('nb', {});
		expect(screenLanguage()).toBe('nb');
		setAppCopy(undefined, {});
		expect(screenLanguage()).toBe('en');
	});
});
