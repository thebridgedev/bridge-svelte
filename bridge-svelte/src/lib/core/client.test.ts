/**
 * The client, stores, hand-off and the bootstrap load, end to end against
 * auth-core's fake issuer.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { memoryStorage } from '@nebulr-group/bridge-auth-core';
import { createFakeIssuer } from '@nebulr-group/bridge-auth-core/testing';
import { getBridge, resetClient, startClient } from './client.js';
import { resolveConfig, type BridgeConfig } from './config.js';
import { flag } from './flags.js';
import { handoffSignIn, readHandoff } from './handoff.js';
import { session, signedIn, workspace, workspaces } from './stores.js';
import { bridgeBootstrap } from '../bootstrap.js';

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

	it('refuses any return address but a loopback IP with a port', () => {
		expect(readHandoff(request('http://127.0.0.1:53123/callback')).status).toBe('ready');
		expect(readHandoff(request('http://[::1]:53123/callback')).status).toBe('ready');
		expect(readHandoff(request('http://localhost:53123/callback')).status).toBe('invalid');
		expect(readHandoff(request('https://evil.test/callback')).status).toBe('invalid');
		expect(readHandoff(request('http://127.0.0.1@evil.test:53123/')).status).toBe('invalid');
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
		expect(back.searchParams.get('state')).toBe('state-0001');
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
