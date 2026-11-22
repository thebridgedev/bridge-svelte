import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { memoryStorage } from '@nebulr-group/bridge-auth-core';
import { createFakeIssuer } from '@nebulr-group/bridge-auth-core/testing';
import { bridgeBootstrap } from '../bootstrap.js';
import { getBridge, resetClient } from './client.js';
import { opensForEveryone } from './guard.js';
import { resolveConfig, type BridgeConfig } from './config.js';
import { flag } from './flags.js';

/**
 * Sign-in problems at startup never break a page built with the plugin (TBP-123). When a page opens the plugin checks
 * for a stored sign-in, refreshes it when old, and loads flags; if any of that fails, the visitor is treated as signed
 * out, the page shows, and flags have their default values.
 */

const PASSWORD = 'correct horse battery';
const PUBLIC_PAGE = { rules: [{ match: '/', public: true }] } satisfies BridgeConfig;

type Break = 'hanging' | 'refresh-refused' | 'refresh-down' | 'unreachable' | 'discovery-down' | 'flags-down' | 'flags-garbage';

function event(path: string) {
	return { url: new URL(`http://localhost${path}`), params: {}, route: { id: '/' }, depends: () => undefined };
}

/** A person who signed in last month: their refresh token is stored, and something is wrong when the page opens. */
async function visitorWith(problem: Break | null, config: BridgeConfig = PUBLIC_PAGE) {
	const fake = createFakeIssuer({ methods: ['password'] });
	fake.addPerson({ email: 'anna@acme.test', password: PASSWORD, workspaces: [{ id: 'ws', name: 'Acme', role: 'OWNER' }] });
	fake.setFlags({ 'bridge-app-active': true, 'new-home': true });
	const storage = memoryStorage();
	// Last month: signed in, the refresh token is kept.
	const before = resolveConfig({ issuer: fake.issuer, ...config }, undefined);
	const { createBridge } = await import('@nebulr-group/bridge-auth-core');
	const month = createBridge({ issuer: fake.issuer, fetch: fake.fetch, storage, autoRefresh: false, locks: null, tabChannel: null, live: false, loadFlags: false });
	await month.ready;
	await month.signIn.start({ email: 'anna@acme.test', password: PASSWORD });
	month.destroy();
	void before;

	const broken: typeof fetch = async (input, init) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		if (problem === 'hanging') return new Promise<Response>(() => undefined);
		if (problem === 'unreachable') throw new TypeError('Failed to fetch');
		if (problem === 'discovery-down' && url.endsWith('/.well-known/openid-configuration')) return new Response('{"error":"temporarily_unavailable"}', { status: 503, headers: { 'content-type': 'application/json' } });
		if (problem === 'refresh-down' && url.endsWith('/token')) return new Response('oops', { status: 500 });
		if (problem === 'refresh-refused' && url.endsWith('/token')) return new Response('{"error":"invalid_grant"}', { status: 400, headers: { 'content-type': 'application/json' } });
		if (problem === 'flags-down' && url.includes('/flags')) return new Response('oops', { status: 500 });
		if (problem === 'flags-garbage' && url.includes('/flags')) return new Response('<html>not json</html>', { status: 200, headers: { 'content-type': 'text/html' } });
		return fake.fetch(input, init);
	};
	return { fake, storage, fetch: broken, config };
}

async function open(problem: Break | null, path: string, config: BridgeConfig = PUBLIC_PAGE) {
	const visitor = await visitorWith(problem, config);
	const { startClient } = await import('./client.js');
	// The same client the layout's load makes, on the visitor's storage and the broken network.
	startClient(resolveConfig({ issuer: visitor.fake.issuer, ...visitor.config }, undefined), { fetch: visitor.fetch, storage: visitor.storage, autoRefresh: false, locks: null, tabChannel: null, live: false });
	const started = Date.now();
	let outcome: string;
	try {
		await bridgeBootstrap({ issuer: visitor.fake.issuer, ...visitor.config })(event(path));
		outcome = 'allow';
	} catch (thrown) {
		const t = thrown as { status?: number; location?: string };
		outcome = t.location !== undefined ? `${t.status} ${t.location}` : `${t.status ?? String(thrown)}`;
	}
	return { outcome, ms: Date.now() - started };
}

afterEach(() => {
	resetClient();
	delete (globalThis as { window?: unknown }).window;
});

describe('a sign-in problem at startup never breaks a public page', () => {
	const problems: Break[] = ['hanging', 'refresh-refused', 'refresh-down', 'unreachable', 'discovery-down', 'flags-down', 'flags-garbage'];
	it.each(problems)('shows the page when %s', async (problem) => {
		(globalThis as { window?: unknown }).window = { location: { hash: '' } };
		const { outcome, ms } = await open(problem, '/');
		expect(outcome).toBe('allow');
		// It does not hold the page back for long either.
		expect(ms).toBeLessThan(3000);
	});

	it('treats the visitor as signed out and gives flags their default values', async () => {
		(globalThis as { window?: unknown }).window = { location: { hash: '' } };
		await open('unreachable', '/');
		const { session } = await import('./stores.js');
		expect(get(session).status).not.toBe('signed-in');
		expect(get(flag('new-home', 'default'))).toBe('default');
	});

	it('still opens the page for a visitor whose sign-in is fine', async () => {
		(globalThis as { window?: unknown }).window = { location: { hash: '' } };
		expect((await open(null, '/')).outcome).toBe('allow');
	});
});

describe('pages that need sign-in still send the visitor to sign in', () => {
	it.each(['refresh-refused', 'unreachable'] as Break[])('a protected page sends the visitor to sign-in when %s', async (problem) => {
		(globalThis as { window?: unknown }).window = { location: { hash: '' } };
		const { outcome } = await open(problem, '/settings');
		expect(outcome).toBe('307 /auth/sign-in?redirectUri=%2Fsettings');
	});

	it('the sign-up and sign-in pages open when startup is broken', async () => {
		(globalThis as { window?: unknown }).window = { location: { hash: '' } };
		expect((await open('unreachable', '/auth/sign-in')).outcome).toBe('allow');
		expect((await open('flags-down', '/auth/sign-up')).outcome).toBe('allow');
	});
});

describe('marking pages public makes them skip the sign-in startup work', () => {
	const config = (rules: BridgeConfig['rules'], defaultAccess?: 'public' | 'protected') => resolveConfig({ issuer: 'https://bridge.test/identity-access/apps/a', rules, ...(defaultAccess === undefined ? {} : { defaultAccess }) }, undefined);

	it('a public page that no flag gates opens for everyone; sign-in pages and flag-gated pages do not', () => {
		const c = config([{ match: '/', public: true }, { match: '/beta', public: true, featureFlag: 'beta' }, { match: '/docs/*', public: true }]);
		expect(opensForEveryone(c, '/')).toBe(true);
		expect(opensForEveryone(c, '/docs/intro')).toBe(true);
		expect(opensForEveryone(c, '/beta')).toBe(false);
		expect(opensForEveryone(c, '/settings')).toBe(false);
		expect(opensForEveryone(c, '/auth/sign-in')).toBe(false);
		expect(opensForEveryone(config([], 'public'), '/anything')).toBe(true);
		expect(opensForEveryone(config([{ match: '/private', public: false }], 'public'), '/private')).toBe(false);
	});

	it('a public page shows at once while Bridge does not answer, without waiting for the stored sign-in', async () => {
		(globalThis as { window?: unknown }).window = { location: { hash: '' } };
		const { outcome, ms } = await open('hanging', '/');
		expect(outcome).toBe('allow');
		expect(ms).toBeLessThan(500);
	});

	it('an app with defaultAccess public shows every page at once', async () => {
		(globalThis as { window?: unknown }).window = { location: { hash: '' } };
		const { outcome, ms } = await open('hanging', '/about', { defaultAccess: 'public' });
		expect(outcome).toBe('allow');
		expect(ms).toBeLessThan(500);
	});
});

describe('a failure the guard does not expect is taken as a signed-out visitor', () => {
	it('sends a page that needs sign-in to sign in, instead of failing the page', async () => {
		(globalThis as { window?: unknown }).window = { location: { hash: '' } };
		const visitor = await visitorWith('refresh-refused', { rules: [{ match: '/', public: true }, { match: '/gated', featureFlag: 'beta' }] });
		const { startClient } = await import('./client.js');
		const client = startClient(resolveConfig({ issuer: visitor.fake.issuer, ...visitor.config }, undefined), { fetch: visitor.fetch, storage: visitor.storage, autoRefresh: false, locks: null, tabChannel: null, live: false });
		await client.ready;
		vi.spyOn(client.flags, 'enabled').mockImplementation(() => {
			throw new Error('flags broke');
		});
		vi.spyOn(client.session, 'get').mockImplementationOnce(() => {
			throw new Error('session broke');
		});
		let outcome = 'allow';
		try {
			await bridgeBootstrap({ issuer: visitor.fake.issuer, ...visitor.config })(event('/gated'));
		} catch (thrown) {
			const t = thrown as { status?: number; location?: string };
			outcome = `${t.status} ${t.location}`;
		}
		expect(outcome).toBe('307 /auth/sign-in?redirectUri=%2Fgated');
		expect(getBridge()).toBe(client);
	});
});
