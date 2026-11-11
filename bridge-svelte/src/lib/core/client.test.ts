/**
 * The client, stores, hand-off and the bootstrap load, end to end against
 * auth-core's fake issuer.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { memoryStorage } from '@nebulr-group/bridge-auth-core';
import { createFakeIssuer } from '@nebulr-group/bridge-auth-core/testing';
import { dropRequestFromAddress, getBridge, resetClient, startClient } from './client.js';
import { resolveConfig, type BridgeConfig } from './config.js';
import { flag } from './flags.js';
import { handoffSignIn, readHandoff } from './handoff.js';
import { session, signedIn, workspace, workspaces } from './stores.js';
import { bridgeBootstrap } from '../bootstrap.js';
import { bridgeFetch } from './fetch.js';
import { closeUpgrade, upgradeRequest } from './upgrade.js';

const PASSWORD = 'correct horse battery';

function setup(config: BridgeConfig = {}) {
	const fake = createFakeIssuer();
	fake.addPerson({ email: 'alice@acme.test', password: PASSWORD, firstName: 'Alice', workspaces: [{ id: 'ws-acme', name: 'Acme', role: 'OWNER' }] });
	fake.addPerson({ email: 'bob@acme.test', password: PASSWORD, workspaces: [{ id: 'ws-acme', name: 'Acme' }, { id: 'ws-globex', name: 'Globex' }] });
	fake.setFlags({ 'bridge-app-active': true, reports: false });
	const options = { fetch: fake.fetch, storage: memoryStorage(), autoRefresh: false, locks: null, tabChannel: null, live: false as const };
	const resolved = resolveConfig({ issuer: fake.issuer, ...config }, undefined);
	const client = startClient(resolved, options);
	return { fake, client, options, config: { issuer: fake.issuer, ...config } };
}

/** Waits for a store to reach a value. */
function until<T>(store: { subscribe(fn: (v: T) => void): () => void }, test: (v: T) => boolean): Promise<T> {
	return new Promise((resolve) => {
		let stop: (() => void) | undefined = undefined;
		stop = store.subscribe((v) => {
			if (test(v)) {
				queueMicrotask(() => stop?.());
				resolve(v);
			}
		});
	});
}

afterEach(() => resetClient());

describe('the client and its stores', () => {
	it('signs in, names the workspace, and reads flags', async () => {
		const { client } = setup();
		await client.ready;
		expect(get(session)).toEqual({ status: 'signed-out', reason: 'never-signed-in' });
		const step = await getBridge().signIn.start({ email: 'alice@acme.test', password: PASSWORD });
		expect(step.done).toBe(true);
		expect(get(signedIn)).toBe(true);
		const named = await until(workspace, (w) => w?.name === 'Acme');
		expect(named).toMatchObject({ id: 'ws-acme', name: 'Acme' });
		await client.flags.load();
		expect(get(flag('bridge-app-active'))).toBe(true);
		expect(get(flag('reports'))).toBe(false);
		expect(get(flag('missing', 'fallback'))).toBe('fallback');
	});

	it('asks for the workspace when there are several, and follows a switch', async () => {
		const { client } = setup();
		await client.ready;
		const step = await client.signIn.start({ email: 'bob@acme.test', password: PASSWORD });
		if (step.done) throw new Error('expected the workspace step');
		expect(step.workspaces.map((w) => w.name)).toEqual(['Acme', 'Globex']);
		await step.choose('ws-globex');
		await until(workspaces, (list) => (list.value?.length ?? 0) === 2);
		expect(get(workspace)?.id).toBe('ws-globex');
		await client.workspaces.switch('ws-acme');
		const switched = await until(workspace, (w) => w?.id === 'ws-acme' && w.name === 'Acme');
		expect(switched?.name).toBe('Acme');
	});

	it('keeps one client per issuer', () => {
		const { client, fake, options } = setup();
		expect(startClient(resolveConfig({ issuer: fake.issuer }, undefined), options)).toBe(client);
	});
});

describe('hand-off', () => {
	const request = (redirect: string) =>
		new URLSearchParams({ code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', code_challenge_method: 'S256', redirect_uri: redirect, state: 'state-0001' });

	it('refuses any return address but a loopback IP with a port, at /callback', () => {
		expect(readHandoff(request('http://127.0.0.1:53123/callback')).status).toBe('ready');
		expect(readHandoff(request('http://[::1]:53123/callback')).status).toBe('ready');
		for (const address of [
			'http://localhost:53123/callback',
			'https://evil.test/callback',
			'https://127.0.0.1:53123/callback',
			'http://127.0.0.1.evil.com:53123/callback',
			'http://127.0.0.1@evil.com/callback',
			'http://127.0.0.1@evil.test:53123/callback',
			'http://127.0.0.1/callback',
			'http://127.0.0.1:53123/callback#frag',
			'http://127.0.0.1:53123/',
			'http://127.0.0.1:53123/other',
		]) {
			expect(readHandoff(request(address)).status, address).toBe('invalid');
		}
		const plain = request('http://127.0.0.1:53123/callback');
		plain.set('code_challenge_method', 'plain');
		expect(readHandoff(plain).status).toBe('invalid');
		const twice = request('http://127.0.0.1:53123/callback');
		twice.append('redirect_uri', 'https://evil.test/callback');
		expect(readHandoff(twice).status).toBe('invalid');
		expect(readHandoff(new URLSearchParams()).status).toBe('invalid');
	});

	it('signs in for the program and returns the code with its state, without touching this page\'s session', async () => {
		const { client } = setup();
		await client.ready;
		const ready = readHandoff(request('http://127.0.0.1:53123/callback'));
		if (ready.status !== 'ready') throw new Error('expected ready');
		const first = await handoffSignIn(client, ready.request, { email: 'bob@acme.test', password: PASSWORD });
		if (first.status !== 'workspace') throw new Error('expected the workspace step');
		const done = await first.choose('ws-acme');
		if (done.status !== 'done') throw new Error('expected done');
		const back = new URL(done.returnUrl);
		expect(back.origin).toBe('http://127.0.0.1:53123');
		expect(back.pathname).toBe('/callback');
		expect(back.searchParams.get('state')).toBe('state-0001');
		expect(back.searchParams.get('iss')).toBe(client.issuer);
		expect(back.searchParams.get('code')).toBeTruthy();
		expect(get(session).status).toBe('signed-out');
	});
});

describe('bridgeBootstrap', () => {
	const event = (path: string, routeId: string | null = '/[...rest]', params: Record<string, string> = {}) => ({
		url: new URL(`http://localhost${path}`),
		params,
		route: { id: routeId },
		depends: () => undefined,
	});

	async function outcome(load: ReturnType<typeof bridgeBootstrap>, path: string, routeId?: string | null, params?: Record<string, string>) {
		try {
			await load(event(path, routeId, params));
			return 'allow';
		} catch (thrown) {
			const t = thrown as { status?: number; location?: string };
			return t.location !== undefined ? `${t.status} ${t.location}` : `${t.status}`;
		}
	}

	it('guards navigations and answers unknown auth pages with a 404', async () => {
		(globalThis as { window?: unknown }).window = { location: { hash: '' } };
		try {
			const { client, config } = setup({ rules: [{ match: '/', public: true }, { match: '/reports', featureFlag: 'reports' }] });
			const load = bridgeBootstrap(config);
			expect(await outcome(load, '/')).toBe('allow');
			expect(await outcome(load, '/settings')).toBe('307 /auth/sign-in?redirectUri=%2Fsettings');
			expect(await outcome(load, '/auth/nope', '/auth/[...bridge]', { bridge: 'nope' })).toBe('404');
			expect(await outcome(load, '/auth/sign-in', '/auth/[...bridge]', { bridge: 'sign-in' })).toBe('allow');
			await client.signIn.start({ email: 'alice@acme.test', password: PASSWORD });
			await client.flags.load();
			expect(await outcome(load, '/settings')).toBe('allow');
			expect(await outcome(load, '/reports')).toBe('307 /');
			expect(await outcome(load, '/auth/sign-in?redirectUri=%2Fsettings', '/auth/[...bridge]', { bridge: 'sign-in' })).toBe('307 /settings');
		} finally {
			delete (globalThis as { window?: unknown }).window;
		}
	});

	it('sends an email link to its page, keeping the token in the fragment', async () => {
		const hash = '#bridge=reset-password&token=abc';
		(globalThis as { window?: unknown }).window = { location: { hash } };
		try {
			const { config } = setup();
			expect(await outcome(bridgeBootstrap(config), '/auth', '/auth/[...bridge]', { bridge: '' })).toBe(`307 /auth/set-password${hash}`);
			(globalThis as { window?: { location: { hash: string } } }).window = { location: { hash: '' } };
			expect(await outcome(bridgeBootstrap(config), '/auth', '/auth/[...bridge]', { bridge: '' })).toBe('307 /auth/sign-in');
		} finally {
			delete (globalThis as { window?: unknown }).window;
		}
	});
});

describe('a sign-in request in the address', () => {
	const REQUEST = 'r'.repeat(43);
	const event = (path: string) => ({ url: new URL(`http://localhost${path}`), params: { bridge: 'sign-in' }, route: { id: '/auth/[...bridge]' }, depends: () => undefined });
	async function outcome(load: ReturnType<typeof bridgeBootstrap>, path: string) {
		try {
			await load(event(path));
			return 'allow';
		} catch (thrown) {
			const t = thrown as { status?: number; location?: string };
			return `${t.status} ${t.location}`;
		}
	}

	it('is taken once, and the same page is loaded without it, so the address never keeps it', async () => {
		(globalThis as { window?: unknown }).window = { location: { hash: '' } };
		try {
			const { client, config } = setup({ handoff: { requests: true } });
			expect(await outcome(bridgeBootstrap(config), `/auth/sign-in?request=${REQUEST}&lang=sv`)).toBe('307 /auth/sign-in?lang=sv');
			expect(await client.request.current()).toBe(REQUEST);
			expect(await outcome(bridgeBootstrap(config), '/auth/sign-in')).toBe('allow');
			expect(await client.request.current()).toBe(REQUEST);
		} finally {
			delete (globalThis as { window?: unknown }).window;
		}
	});

	it('is left alone on a page that does not sign in for requests', async () => {
		(globalThis as { window?: unknown }).window = { location: { hash: '' } };
		try {
			const { client, config } = setup();
			expect(await outcome(bridgeBootstrap(config), `/auth/sign-in?request=${REQUEST}`)).toBe('allow');
			expect(await client.request.current()).toBeNull();
		} finally {
			delete (globalThis as { window?: unknown }).window;
		}
	});

	it('is removed from the address bar and the history entry, keeping the rest of the address', () => {
		const replaced: unknown[][] = [];
		const state = { kept: true };
		(globalThis as { window?: unknown }).window = {
			location: { href: `https://bridge.test/sign-in/app/auth/sign-in/?request=${REQUEST}&lang=sv#x` },
			history: { state, replaceState: (...args: unknown[]) => replaced.push(args) },
		};
		try {
			dropRequestFromAddress();
			expect(replaced).toEqual([[state, '', '/sign-in/app/auth/sign-in/?lang=sv#x']]);
		} finally {
			delete (globalThis as { window?: unknown }).window;
		}
	});
});

describe('bridgeFetch and the upgrade dialog', () => {
	const API = 'https://api.example.test';
	const limit = { code: 'QUOTA_EXCEEDED', metric: 'tickets', used: 3, limit: 3, fix: '/subscription' };

	async function withApi(answer: (url: string) => Response) {
		const fake = createFakeIssuer();
		fake.addPerson({ email: 'alice@acme.test', password: PASSWORD, workspaces: [{ id: 'ws-acme', name: 'Acme' }] });
		const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new Request(input, init).url;
			return url.startsWith(API) ? answer(url) : fake.fetch(input, init);
		}) as typeof fetch;
		const resolved = resolveConfig({ issuer: fake.issuer, tokenOrigins: [API] }, undefined);
		const client = startClient(resolved, { fetch: fetchFn, storage: memoryStorage(), autoRefresh: false, locks: null, tabChannel: null, live: false });
		await client.signIn.start({ email: 'alice@acme.test', password: PASSWORD });
		return fake;
	}

	const redirectedFrom = (url: string, body: unknown) => {
		const response = Response.json(body, { status: 402 });
		Object.defineProperty(response, 'redirected', { value: true });
		Object.defineProperty(response, 'url', { value: url });
		return response;
	};

	afterEach(() => closeUpgrade());

	it('opens for a plan limit your API refused', async () => {
		await withApi(() => Response.json(limit, { status: 402 }));
		const response = await bridgeFetch(`${API}/tickets`, { method: 'POST' });
		expect(response.status).toBe(402);
		expect(get(upgradeRequest)).toMatchObject({ kind: 'limit', metric: 'tickets', upgradeHref: '/subscription' });
	});

	it('stays shut for a 402 that came through a redirect, or from another host', async () => {
		await withApi((url) => (url.endsWith('/redirect') ? redirectedFrom('https://evil.test/402', limit) : Response.json(limit, { status: 402 })));
		expect((await bridgeFetch(`${API}/redirect`)).status).toBe(402);
		expect(get(upgradeRequest)).toBeNull();
		resetClient();
		await withApi(() => {
			const response = Response.json(limit, { status: 402 });
			Object.defineProperty(response, 'url', { value: 'https://evil.test/402' });
			return response;
		});
		await bridgeFetch(`${API}/other`);
		expect(get(upgradeRequest)).toBeNull();
	});
});
