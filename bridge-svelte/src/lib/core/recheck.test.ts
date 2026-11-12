/**
 * Confirming it is you: the store behind the dialog, and `withRecheck`, end to
 * end against auth-core's fake issuer with recent-sign-in routes. The dialog
 * itself is covered by the demo's Playwright suite.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { memoryStorage } from '@nebulr-group/bridge-auth-core';
import { createFakeIssuer, fakeWebAuthn } from '@nebulr-group/bridge-auth-core/testing';
import { getBridge, resetClient, startClient } from './client.js';
import { resolveConfig } from './config.js';
import { cancelRecheck, confirmItIsYou, recheckRequest, withRecheck, type RecheckRequest } from './recheck.js';

const PASSWORD = 'correct horse battery';

/** Alice, signed in an hour ago, on an issuer where renaming yourself wants a sign-in within 5 minutes. */
async function aliceLongAgo() {
	// Bridge's clock, which a test moves on: a token's sign-in time is in whole seconds.
	let offset = 0;
	const fake = createFakeIssuer({ methods: ['password', 'magicLink', 'passkeys'], recheck: { routes: ['PATCH /v2/accounts/me'], maxAgeSeconds: 300 }, now: () => Date.now() + offset });
	fake.addPerson({ email: 'alice@acme.test', password: PASSWORD, firstName: 'Alice', workspaces: [{ id: 'ws-acme', name: 'Acme', role: 'OWNER' }] });
	const device = fakeWebAuthn();
	const client = startClient(resolveConfig({ issuer: fake.issuer }, undefined), {
		fetch: fake.fetch,
		storage: memoryStorage(),
		signUpStorage: memoryStorage(),
		webauthn: device,
		autoRefresh: false,
		locks: null,
		tabChannel: null,
		live: false,
	});
	await client.signIn.start({ email: 'alice@acme.test', password: PASSWORD });
	fake.signedInLongAgo();
	offset += 2000;
	return { fake, client, device };
}

const rename = () => getBridge().me.update({ firstName: 'Alicia' });
const renames = (fake: ReturnType<typeof createFakeIssuer>) => fake.requests.filter((each) => each.method === 'PATCH' && each.path === '/v2/accounts/me').length;

/** Waits for the dialog to open. */
function opened() {
	return new Promise<RecheckRequest>((resolve) => {
		const stop = recheckRequest.subscribe((request) => {
			if (request === null) return;
			queueMicrotask(() => stop());
			resolve(request);
		});
	});
}

afterEach(() => {
	cancelRecheck();
	resetClient();
});

describe('withRecheck', () => {
	it('asks once when Bridge wants a recent sign-in; a wrong password keeps the dialog open, the right one tries the action again, once', async () => {
		const { fake, client } = await aliceLongAgo();
		const done = withRecheck(rename);
		const request = await opened();
		expect(renames(fake)).toBe(1);

		await expect(client.recheck.password('not it')).rejects.toMatchObject({ kind: 'wrong-credentials' });
		expect(get(recheckRequest)).not.toBeNull();
		expect(renames(fake)).toBe(1);

		await client.recheck.password(PASSWORD);
		request.confirmed();
		await expect(done).resolves.toMatchObject({ firstName: 'Alicia' });
		expect(renames(fake)).toBe(2);
		expect(get(recheckRequest)).toBeNull();
		expect(client.session.get()).toMatchObject({ status: 'signed-in' });
	});

	it('a cancel rejects as cancelled and the action is not tried again', async () => {
		const { fake } = await aliceLongAgo();
		const done = withRecheck(rename);
		const request = await opened();
		request.cancelled();
		await expect(done).rejects.toMatchObject({ kind: 'cancelled' });
		expect(renames(fake)).toBe(1);
		expect(get(recheckRequest)).toBeNull();
	});

	it('does not ask for an action that needs nothing, and passes other errors on', async () => {
		const { fake } = await aliceLongAgo();
		await expect(withRecheck(async () => 'fine')).resolves.toBe('fine');
		await expect(withRecheck(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
		expect(get(recheckRequest)).toBeNull();
		expect(renames(fake)).toBe(0);
	});

	it('a second refusal after confirming is thrown, not asked again', async () => {
		const { fake } = await aliceLongAgo();
		// Confirmed in the dialog, yet Bridge still refuses (the sign-in time did not move).
		const done = withRecheck(rename);
		const request = await opened();
		request.confirmed();
		await expect(done).rejects.toMatchObject({ kind: 'reauthenticate' });
		expect(renames(fake)).toBe(2);
		expect(get(recheckRequest)).toBeNull();
	});

	it('actions refused together share one dialog and all go on once it is confirmed', async () => {
		const { fake, client } = await aliceLongAgo();
		const first = withRecheck(rename);
		const second = withRecheck(rename);
		const request = await opened();
		await client.recheck.password(PASSWORD);
		request.confirmed();
		await expect(Promise.all([first, second])).resolves.toHaveLength(2);
		expect(renames(fake)).toBe(4);
	});

	it('by a link to the person\'s address: the dialog waits, the link opened here confirms, the action goes on', async () => {
		const { fake, client } = await aliceLongAgo();
		const done = withRecheck(rename);
		const request = await opened();
		await client.recheck.email();
		const waiting = client.recheck.emailOpened({ everyMs: 60_000 });
		const link = fake.lastLink('alice@acme.test', 'magic-link')!;
		await expect(client.magicLink.finish(link)).resolves.toEqual({ done: true, rechecked: true });
		await waiting;
		request.confirmed();
		await expect(done).resolves.toMatchObject({ firstName: 'Alicia' });
	});

	it('waiting for the link stops when the dialog is cancelled', async () => {
		const { client } = await aliceLongAgo();
		const done = withRecheck(rename);
		const request = await opened();
		await client.recheck.email();
		const stop = new AbortController();
		const waiting = client.recheck.emailOpened({ signal: stop.signal, everyMs: 60_000 });
		stop.abort();
		await expect(waiting).rejects.toMatchObject({ kind: 'cancelled' });
		request.cancelled();
		await expect(done).rejects.toMatchObject({ kind: 'cancelled' });
	});

	it('by passkey: one of the person\'s own passkeys confirms', async () => {
		const { fake, client } = await aliceLongAgo();
		await client.passkeys.add('Laptop');
		fake.signedInLongAgo();
		const done = withRecheck(rename);
		const request = await opened();
		await client.recheck.passkey();
		request.confirmed();
		await expect(done).resolves.toMatchObject({ firstName: 'Alicia' });
	});
});

describe('confirmItIsYou', () => {
	it('opens one dialog however many ask, and closing it as cancelled rejects every waiting call', async () => {
		await aliceLongAgo();
		const first = confirmItIsYou();
		const second = confirmItIsYou();
		expect(second).toBe(first);
		const caught = [first, second].map((each) => each.catch((error: unknown) => error));
		cancelRecheck();
		expect(await Promise.all(caught)).toEqual([expect.objectContaining({ kind: 'cancelled' }), expect.objectContaining({ kind: 'cancelled' })]);
		expect(get(recheckRequest)).toBeNull();
		// A later ask opens a new one.
		const again = confirmItIsYou();
		expect(again).not.toBe(first);
		(await opened()).confirmed();
		await expect(again).resolves.toBeUndefined();
	});
});
