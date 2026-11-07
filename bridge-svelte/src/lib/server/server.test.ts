/**
 * The server helpers against tokens and revocation lists signed exactly like
 * Bridge's (auth-core's fixtures), so the 401s and 503s are the real ones.
 */
import { describe, expect, it, vi } from 'vitest';
import { APP, makeKeyRing, mint, tamper, type KeyRing } from '../../../test-fixtures/signed/fixtures.js';
import { fakeRevocationList, makeLaneKey, type LaneKey } from '../../../test-fixtures/signed/revocation-fixtures.js';
import { bridgeHandle, flagsFor, meter, requireActor } from './index.js';

const ORIGIN = 'https://bridge.test';
const ISSUER = `${ORIGIN}/identity-access/apps/${APP}`;
const AUDIENCE = `${ORIGIN}/api`;
const LIST = `${ORIGIN}/v2/lanes`;
const JWKS = `${ORIGIN}/v2/identity-access/apps/${APP}/jwks.json`;
const LANES = ['identity-access', 'accounts', 'billing', 'app-registry'] as const;
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
