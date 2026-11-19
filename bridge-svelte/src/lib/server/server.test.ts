/**
 * The server helpers against tokens and revocation lists signed exactly like
 * Bridge's (auth-core's fixtures), so the 401s and 503s are the real ones.
 */
import { describe, expect, it, vi } from 'vitest';
import { APP, makeKeyRing, mint, tamper, type KeyRing } from '../../../test-fixtures/signed/fixtures.js';
import { fakeRevocationList, makeLaneKey, type LaneKey } from '../../../test-fixtures/signed/revocation-fixtures.js';
import { isHttpError } from '@sveltejs/kit';
import { bridgeHandle, flagsFor, meter, requireActor, requireFlag } from './index.js';

const ORIGIN = 'https://bridge.test';
const ISSUER = `${ORIGIN}/identity-access/apps/${APP}`;
const AUDIENCE = `${ORIGIN}/api`;
const LIST = `${ORIGIN}/v2/lanes`;
const JWKS = `${ORIGIN}/v2/identity-access/apps/${APP}/jwks.json`;
const LANES = ['identity-access', 'accounts', 'billing', 'app-registry'] as const;
const INTROSPECT = `${ORIGIN}/v2/identity-access/apps/${APP}/introspect`;
const FLAGS = `${ORIGIN}/v2/flags/ofrep/v1/evaluate/flags`;
/** Two keys: one holds the privilege the `reports` flag's rule asks for, one does not. */
const KEYS: Record<string, { sub: string; kind: string; privileges: string[]; reports: boolean }> = {
	'key-holder': { sub: 'key-1', kind: 'app_key', privileges: ['reports:read'], reports: true },
	'key-bare': { sub: 'key-2', kind: 'service_account_key', privileges: [], reports: false },
};
const offline = (() => Promise.reject(new TypeError('offline'))) as unknown as typeof fetch;

async function issuer(options: { listNow?: () => number } = {}) {
	const ring = await makeKeyRing();
	const laneKeys: Record<string, LaneKey> = {};
	for (const lane of LANES) laneKeys[lane] = await makeLaneKey(lane);
	const list = fakeRevocationList(laneKeys, APP, options.listNow ?? (() => Date.now()), { list: LIST, jwks: JWKS });
	list.setKeys({ keys: [ring.app.publicJwk, ...Object.values(laneKeys).map((key) => key.publicJwk)] });
	const metadata = {
		issuer: ISSUER,
		token_endpoint: `${ORIGIN}/v2/identity-access/apps/${APP}/token`,
		introspection_endpoint: `${ORIGIN}/v2/identity-access/apps/${APP}/introspect`,
		jwks_uri: JWKS,
		bridge_app: APP,
		bridge_access_token_audience: AUDIENCE,
		bridge_revocation_lanes: Object.fromEntries(LANES.map((lane) => [lane, `${LIST}/${lane}`])),
		bridge_endpoints: { '2': { sign_in: `${ORIGIN}/v2/identity-access/apps/${APP}/sign-in`, accounts: `${ORIGIN}/v2/accounts`, billing: `${ORIGIN}/v2/billing`, flags: `${ORIGIN}/v2/flags` } },
	};
	const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new Request(input, init).url;
		if (url === `${ISSUER}/.well-known/openid-configuration`) return Response.json(metadata);
		const key = new Request(input, init).headers.get('x-api-key');
		if (url === FLAGS) {
			// Bridge works the flag out for the key's own privileges.
			const known = key === null ? undefined : KEYS[key];
			const person = new Request(input, init).headers.get('authorization')?.startsWith('Bearer ') === true;
			return Response.json({ flags: [{ key: 'reports', value: person || (known?.reports ?? false), reason: 'TARGETING_MATCH' }] });
		}
		if (url === INTROSPECT) {
			const { token } = (await new Request(input, init).json()) as { token: string };
			const known = KEYS[token];
			if (known === undefined) return Response.json({ active: false });
			return Response.json({ active: true, type: 'api', sub: known.sub, appId: APP, tenantId: known.kind === 'app_key' ? null : 'ws-acme', kind: known.kind, privileges: known.privileges });
		}
		return list.fetch(input, init);
	}) as typeof fetch;
	return { ring, list, fetchFn };
}

function personToken(ring: KeyRing, overrides: Record<string, unknown> = {}) {
	const now = Math.floor(Date.now() / 1000);
	return mint(
		ring.app,
		{ aid: APP, tid: 'ws-acme', mid: 'mem-1', role: 'OWNER', wst: 'active', sid: 'ses-1', client_id: APP, auth_time: now, amr: ['pwd'], email: 'alice@acme.test', email_verified: true, jti: 'jti-1', ...overrides },
		{ issuer: ISSUER, audience: AUDIENCE, subject: 'usr-alice', typ: 'at+jwt' },
	);
}

function eventFor(headers: Record<string, string> = {}, method = 'GET', path = '/api/x') {
	return { request: new Request(`https://app.example.com${path}`, { method, headers }), url: new URL(`https://app.example.com${path}`), locals: {} as Record<string, unknown> };
}

async function run(handle: ReturnType<typeof bridgeHandle>, event: ReturnType<typeof eventFor>) {
	const resolve = vi.fn(async () => new Response('ok'));
	const response = await handle({ event, resolve } as never);
	return { response, resolve };
}

describe('bridgeHandle', () => {
	it('gives the route the caller of a good token', async () => {
		const { ring, fetchFn } = await issuer();
		const handle = bridgeHandle({ issuer: ISSUER, fetch: fetchFn });
		const event = eventFor({ authorization: `Bearer ${await personToken(ring)}` });
		const { response, resolve } = await run(handle, event);
		expect(await response.text()).toBe('ok');
		expect(resolve).toHaveBeenCalledOnce();
		expect(requireActor(event as never)).toMatchObject({ kind: 'person', id: 'usr-alice', workspaceId: 'ws-acme', sessionId: 'ses-1' });
	});

	it('answers a bad signature 401 with WWW-Authenticate, and the route never runs', async () => {
		const { ring, fetchFn } = await issuer();
		const handle = bridgeHandle({ issuer: ISSUER, fetch: fetchFn });
		const forged = tamper(await personToken(ring), (payload) => (payload['sub'] = 'usr-mallory'));
		const { response, resolve } = await run(handle, eventFor({ authorization: `Bearer ${forged}` }));
		expect(response.status).toBe(401);
		expect(response.headers.get('www-authenticate')).toBe('Bearer');
		expect(resolve).not.toHaveBeenCalled();
	});

	it('answers 401 once the session has ended', async () => {
		const { ring, list, fetchFn } = await issuer();
		const handle = bridgeHandle({ issuer: ISSUER, fetch: fetchFn, revocationIntervalMs: 20 });
		const token = await personToken(ring);
		expect((await run(handle, eventFor({ authorization: `Bearer ${token}` }))).response.status).toBe(200);
		await list.revoke('identity-access', { kind: 'session', id: 'ses-1' });
		let status = 200;
		for (let tries = 0; status === 200 && tries < 100; tries += 1) {
			await new Promise((resolve) => setTimeout(resolve, 20));
			status = (await run(handle, eventFor({ authorization: `Bearer ${token}` }))).response.status;
		}
		expect(status).toBe(401);
	});

	it('answers a write 503 while the revocation list is behind, and lets the read through', async () => {
		// The lanes vouch for a minute ago: fine for a read, too old for a write.
		const { ring, fetchFn } = await issuer({ listNow: () => Date.now() - 60_000 });
		const handle = bridgeHandle({ issuer: ISSUER, fetch: fetchFn });
		const token = await personToken(ring);
		expect((await run(handle, eventFor({ authorization: `Bearer ${token}` }, 'GET'))).response.status).toBe(200);
		const write = await run(handle, eventFor({ authorization: `Bearer ${token}` }, 'POST'));
		expect(write.response.status).toBe(503);
		expect(write.resolve).not.toHaveBeenCalled();
	});

	it('leaves Authorization that is not Bridge\'s to the app: basic auth, a route\'s own bearer secret', async () => {
		const { fetchFn } = await issuer();
		const handle = bridgeHandle({ issuer: ISSUER, fetch: fetchFn });
		for (const authorization of ['Basic dXNlcjpwYXNz', 'Bearer cron-secret-123', `Bearer ${'x'.repeat(10)}.${btoa(JSON.stringify({ iss: 'https://elsewhere.test' }))}.sig`]) {
			const event = eventFor({ authorization });
			const { response, resolve } = await run(handle, event);
			expect(response.status, authorization).toBe(200);
			expect(resolve).toHaveBeenCalledOnce();
			expect(() => requireActor(event as never)).toThrow();
		}
	});

	it('skips the routes it is told to, whatever they carry', async () => {
		const { ring, fetchFn } = await issuer();
		const handle = bridgeHandle({ issuer: ISSUER, fetch: fetchFn, skip: (event) => event.url.pathname.startsWith('/api/cron') });
		const forged = tamper(await personToken(ring), (payload) => (payload['sub'] = 'usr-mallory'));
		const { response, resolve } = await run(handle, eventFor({ authorization: `Bearer ${forged}` }, 'POST', '/api/cron/nightly'));
		expect(response.status).toBe(200);
		expect(resolve).toHaveBeenCalledOnce();
		expect((await run(handle, eventFor({ authorization: `Bearer ${forged}` }, 'POST', '/api/tickets'))).response.status).toBe(401);
	});

	it('lets a request without a credential through with no actor', async () => {
		const handle = bridgeHandle({ issuer: ISSUER, fetch: offline, discoveryRetryMs: 60000 });
		const event = eventFor();
		const { response } = await run(handle, event);
		expect(await response.text()).toBe('ok');
		expect(() => requireActor(event as never)).toThrow();
		expect(() => meter(event as never, 'reports')).toThrow(/signed-in caller/);
		expect((await flagsFor(event as never)).enabled('anything')).toBe(false);
	});

	it('answers 503, never yes, while Bridge cannot check a token', async () => {
		const { ring } = await issuer();
		const handle = bridgeHandle({ issuer: ISSUER, fetch: offline, discoveryRetryMs: 60000 });
		const { response, resolve } = await run(handle, eventFor({ authorization: `Bearer ${await personToken(ring)}` }));
		expect(response.status).toBe(503);
		expect(response.headers.get('content-type')).toBe('application/problem+json');
		expect(resolve).not.toHaveBeenCalled();
	});

	it('says how to set it up when the hook is missing', () => {
		expect(() => requireActor({ locals: {} } as never)).toThrow(/bridgeHandle/);
	});
});

/** Runs an endpoint the way SvelteKit would: its thrown `error(...)` becomes the response status. */
async function endpoint(handle: ReturnType<typeof bridgeHandle>, event: ReturnType<typeof eventFor>, route: (event: never) => unknown) {
	const resolve = async () => {
		try {
			await route(event as never);
			return new Response('ok');
		} catch (thrown) {
			if (isHttpError(thrown)) return new Response(thrown.body.message, { status: thrown.status });
			throw thrown;
		}
	};
	const response = await handle({ event, resolve } as never);
	return { status: response.status };
}

describe('keys on server endpoints', () => {
	const gated = (event: never) => requireFlag(event, 'reports');
	const unmarked = (event: never) => requireActor(event);
	const open = (event: never) => requireActor(event, { openToKeys: true });
	const setUp = async () => {
		const { fetchFn } = await issuer();
		return bridgeHandle({ issuer: ISSUER, fetch: fetchFn });
	};

	it('lets a key through an endpoint gated by a flag when its privileges match the flag\'s rule', async () => {
		const handle = await setUp();
		const event = eventFor({ 'x-api-key': 'key-holder' });
		expect((await endpoint(handle, event, gated)).status).toBe(200);
		expect(requireActor(event as never)).toMatchObject({ kind: 'app_key', id: 'key-1' });
	});

	it('answers 403 to a key whose privileges do not match the flag\'s rule', async () => {
		const handle = await setUp();
		const event = eventFor({ 'x-api-key': 'key-bare' });
		expect((await endpoint(handle, event, gated)).status).toBe(403);
		// The refused key is still no caller for the rest of the request.
		expect(() => requireActor(event as never)).toThrow();
		expect((event.locals as { bridge: { actor: unknown } }).bridge.actor).toBeNull();
	});

	it('answers 403 to a key on an endpoint with no flag gate, and the endpoint does no work', async () => {
		const handle = await setUp();
		for (const key of ['key-holder', 'key-bare']) {
			let worked = false;
			const { status } = await endpoint(handle, eventFor({ 'x-api-key': key }, 'POST'), (event) => {
				requireActor(event);
				worked = true;
			});
			expect(status, key).toBe(403);
			expect(worked, key).toBe(false);
		}
	});

	it('answers 403 when an endpoint with no gate reads the caller or counts usage without asking for keys', async () => {
		const handle = await setUp();
		const event = eventFor({ 'x-api-key': 'key-holder' });
		const { status } = await endpoint(handle, event, (e) => meter(e, 'reports'));
		expect(status).toBe(403);
		expect((event.locals as { bridge: { actor: unknown } }).bridge.actor).toBeNull();
	});

	it('lets a key through an endpoint marked open, whatever the flags say', async () => {
		const handle = await setUp();
		for (const key of ['key-holder', 'key-bare']) expect((await endpoint(handle, eventFor({ 'x-api-key': key }), open)).status, key).toBe(200);
	});

	it('still answers 401 to a bad key and 401 to a request with no credential', async () => {
		const handle = await setUp();
		expect((await endpoint(handle, eventFor({ 'x-api-key': 'key-unknown' }), open)).status).toBe(401);
		expect((await endpoint(handle, eventFor(), open)).status).toBe(401);
		expect((await endpoint(handle, eventFor(), gated)).status).toBe(401);
	});

	it('leaves a route in `skip` alone: no check, no actor, whatever it carries', async () => {
		const { fetchFn } = await issuer();
		const handle = bridgeHandle({ issuer: ISSUER, fetch: fetchFn, skip: (event) => event.url.pathname.startsWith('/api/cron') });
		const { status } = await endpoint(handle, eventFor({ 'x-api-key': 'key-bare' }, 'POST', '/api/cron/nightly'), () => undefined);
		expect(status).toBe(200);
	});

	it('gives a `skip` route an empty flag set when the request carries a key or token nothing checked', async () => {
		const { ring, fetchFn } = await issuer();
		const handle = bridgeHandle({ issuer: ISSUER, fetch: fetchFn, skip: (event) => event.url.pathname.startsWith('/api/cron') });
		const foreignKey = eventFor({ 'x-api-key': 'key-holder' }, 'GET', '/api/cron/nightly');
		const token = eventFor({ authorization: `Bearer ${await personToken(ring)}` }, 'GET', '/api/cron/nightly');
		for (const event of [foreignKey, token]) {
			expect((await endpoint(handle, event, () => undefined)).status).toBe(200);
			expect((await flagsFor(event as never)).enabled('reports')).toBe(false);
		}
	});

	it('does not change what a person gets: requireActor, flagsFor and meter work as before', async () => {
		const { ring, fetchFn } = await issuer();
		const handle = bridgeHandle({ issuer: ISSUER, fetch: fetchFn, appKey: 'app-key-1', usageFlushMs: 60_000 });
		const event = eventFor({ authorization: `Bearer ${await personToken(ring)}` });
		expect((await endpoint(handle, event, unmarked)).status).toBe(200);
		expect(event.locals.bridge).toMatchObject({ actor: { kind: 'person', id: 'usr-alice' } });
		expect(() => meter(event as never, 'reports')).not.toThrow();
		expect((await flagsFor(event as never)).enabled('reports')).toBe(true);
		expect((await endpoint(handle, eventFor({ authorization: `Bearer ${await personToken(ring)}` }), open)).status).toBe(200);
	});

	it('lets a person through requireFlag when the flag is on for them', async () => {
		const { ring, fetchFn } = await issuer();
		const handle = bridgeHandle({ issuer: ISSUER, fetch: fetchFn });
		const token = await personToken(ring);
		expect((await endpoint(handle, eventFor({ authorization: `Bearer ${token}` }), gated)).status).toBe(200);
	});
});
