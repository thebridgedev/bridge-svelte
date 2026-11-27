import { afterEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { memoryStorage } from '@nebulr-group/bridge-auth-core';
import { createFakeIssuer } from '@nebulr-group/bridge-auth-core/testing';
import { calls } from '../../../test-stubs/app-navigation.js';
import { resetClient, startClient } from './client.js';
import { resolveConfig, type BridgeConfig } from './config.js';
import { logout } from './logout.js';
import { session } from './stores.js';

const PASSWORD = 'correct horse battery';
const files = import.meta.glob('../components/auth/SignOutButton.svelte', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

async function signedIn(config: BridgeConfig = {}, issuer: Parameters<typeof createFakeIssuer>[0] = {}) {
	const fake = createFakeIssuer(issuer);
	fake.addPerson({ email: 'alice@acme.test', password: PASSWORD, workspaces: [{ id: 'ws-acme', name: 'Acme', role: 'OWNER' }] });
	const client = startClient(resolveConfig({ issuer: fake.issuer, ...config }, undefined), { fetch: fake.fetch, storage: memoryStorage(), autoRefresh: false, locks: null, tabChannel: null, live: false });
	await client.ready;
	await client.signIn.start({ email: 'alice@acme.test', password: PASSWORD });
	calls.goto.length = 0;
	return { fake, client };
}

afterEach(() => resetClient());

describe('signing out keeps people in the app, or where the developer chooses', () => {
	it('goes to the app\'s own sign-in page by default, through the router', async () => {
		await signedIn();
		await expect(logout()).resolves.toEqual({ redirectTo: '/auth/sign-in' });
		expect(calls.goto).toEqual(['/auth/sign-in']);
		expect(get(session).status).toBe('signed-out');
	});

	it('goes to the page the app set as auth.afterSignOut', async () => {
		await signedIn({ auth: { afterSignOut: '/welcome' } });
		await logout();
		expect(calls.goto).toEqual(['/welcome']);
	});

	it('goes to another page of the app, and refuses any other address', async () => {
		await signedIn({ auth: { appOrigins: ['https://app.acme.test'] } });
		await logout({ redirectTo: '/goodbye' });
		expect(calls.goto).toEqual(['/goodbye']);
		for (const other of ['https://evil.test/x', '//evil.test', 'javascript:alert(1)']) {
			await signedIn({ auth: { appOrigins: ['https://app.acme.test'] } });
			await logout({ redirectTo: other });
			expect(calls.goto).toEqual(['/auth/sign-in']);
		}
	});

	it('an address on one of the app\'s own origins is allowed', async () => {
		await signedIn({ auth: { appOrigins: ['https://app.acme.test'] } });
		await logout({ redirectTo: 'https://app.acme.test/bye' });
		expect(calls.goto).toEqual(['https://app.acme.test/bye']);
	});

	it('stays where it is when silent: signed out without a navigation, and the event is heard', async () => {
		const { client } = await signedIn();
		const heard: string[] = [];
		client.on('signed-out', ({ reason }) => heard.push(reason));
		await expect(logout({ silent: true })).resolves.toEqual({ redirectTo: null });
		expect(calls.goto).toEqual([]);
		expect(heard).toEqual(['signed-out']);
		expect(get(session).status).toBe('signed-out');
	});

	it('ends the session at Bridge: a copied token stops working', async () => {
		const { fake, client } = await signedIn();
		const copied = await client.token();
		const asks = () => fake.fetch(`${new URL(fake.issuer).origin}/v2/accounts/me`, { headers: { Authorization: `Bearer ${copied}` } });
		expect((await asks()).status).toBe(200);
		await logout({ silent: true });
		expect((await asks()).status).toBe(401);
	});

	it('goes where the app\'s settings on Bridge say, and lets a chosen address through on the app\'s origins as Bridge lists them, with nothing configured', async () => {
		const signOut = { page: 'https://acme.test/goodbye', origins: ['https://acme.test', 'https://*.acme.test'] };
		await signedIn({}, { signOut });
		await expect(logout()).resolves.toEqual({ redirectTo: 'https://acme.test/goodbye' });
		expect(calls.goto).toEqual(['https://acme.test/goodbye']);
		await signedIn({}, { signOut });
		await logout({ redirectTo: 'https://app.acme.test/bye' });
		expect(calls.goto).toEqual(['https://app.acme.test/bye']);
		await signedIn({}, { signOut });
		await logout({ redirectTo: 'https://evil.test/x' });
		expect(calls.goto).toEqual(['https://acme.test/goodbye']);
		// Bridge names no page: the app's own sign-in page. (A new issuer under the same address needs a new client.)
		resetClient();
		await signedIn({}, { signOut: { page: null, origins: [] } });
		await logout();
		expect(calls.goto).toEqual(['/auth/sign-in']);
	});

	it('<SignOutButton> signs out through logout() with its redirectTo and silent', () => {
		const button = files['../components/auth/SignOutButton.svelte'] as string;
		expect(button).toMatch(/getBridge\(\)\.logout\(/);
		expect(button).toMatch(/redirectTo/);
		expect(button).toMatch(/silent/);
		expect(button).not.toMatch(/goto\(/);
	});
});
