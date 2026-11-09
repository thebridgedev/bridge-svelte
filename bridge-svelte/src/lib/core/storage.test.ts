/**
 * `storage: 'memory'`: nothing of Bridge's reaches the browser's storage.
 * `'local'` (the default) keeps the session in localStorage, so a reload
 * stays signed in.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeIssuer } from '@nebulr-group/bridge-auth-core/testing';
import { getBridge, resetClient, startClient } from './client.js';
import { resolveConfig } from './config.js';

const PASSWORD = 'correct horse battery';

/** A Storage that remembers every key ever written. */
class RecordingStorage {
	readonly items = new Map<string, string>();
	readonly written = new Set<string>();
	get length() {
		return this.items.size;
	}
	key(index: number) {
		return [...this.items.keys()][index] ?? null;
	}
	getItem(key: string) {
		return this.items.get(key) ?? null;
	}
	setItem(key: string, value: string) {
		this.written.add(key);
		this.items.set(key, String(value));
	}
	removeItem(key: string) {
		this.items.delete(key);
	}
	clear() {
		this.items.clear();
	}
}

async function signInAndStartSignUp(storage: 'local' | 'memory' | undefined) {
	const local = new RecordingStorage();
	const session = new RecordingStorage();
	// A browser page: auth-core picks localStorage only where there is a window.
	vi.stubGlobal('window', {});
	vi.stubGlobal('localStorage', local);
	vi.stubGlobal('sessionStorage', session);
	const fake = createFakeIssuer();
	fake.addPerson({ email: 'alice@acme.test', password: PASSWORD, workspaces: [{ id: 'ws-acme', name: 'Acme', role: 'OWNER' }] });
	fake.setFlags({}, { 'visitor-flag': true });
	const config = resolveConfig({ issuer: fake.issuer, ...(storage === undefined ? {} : { storage }) }, undefined);
	const client = startClient(config, { fetch: fake.fetch, autoRefresh: false, locks: null, tabChannel: null, live: false });
	await client.ready;
	await getBridge().signUp.start({ email: 'new@acme.test', password: PASSWORD });
	await getBridge().signIn.start({ email: 'alice@acme.test', password: PASSWORD });
	await client.flags.load();
	return { local, session, config };
}

afterEach(() => {
	resetClient();
	vi.unstubAllGlobals();
});

describe('where the session is kept', () => {
	it("'memory' writes nothing to localStorage or sessionStorage: session, sign-up or visitor", async () => {
		const { local, session, config } = await signInAndStartSignUp('memory');
		expect(config.storage).toBe('memory');
		expect(getBridge().session.get()).toMatchObject({ status: 'signed-in' });
		expect([...local.written]).toEqual([]);
		expect([...session.written]).toEqual([]);
	});

	it("'local' is the default, and keeps the session and the sign-up's verifier in localStorage", async () => {
		const { local, session, config } = await signInAndStartSignUp(undefined);
		expect(config.storage).toBe('local');
		expect([...local.written].some((key) => key.endsWith(':session'))).toBe(true);
		expect([...local.written].some((key) => key.endsWith(':sign-up'))).toBe(true);
		expect([...session.written]).toEqual([]);
	});

	it('refuses anything else, and a new storage makes a new client', () => {
		expect(() => resolveConfig({ issuer: 'https://bridge.test/i', storage: 'cookie' as never }, undefined)).toThrow(/storage is 'local' or 'memory'/);
		const fake = createFakeIssuer();
		const options = { fetch: fake.fetch, autoRefresh: false, locks: null, tabChannel: null, live: false as const };
		const first = startClient(resolveConfig({ issuer: fake.issuer }, undefined), options);
		expect(startClient(resolveConfig({ issuer: fake.issuer }, undefined), options)).toBe(first);
		expect(startClient(resolveConfig({ issuer: fake.issuer, storage: 'memory' }, undefined), options)).not.toBe(first);
	});
});
