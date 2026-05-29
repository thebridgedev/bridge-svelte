import { describe, it, expect } from 'vitest';

import { sha256Email } from './pii-hashing.js';

/**
 * Client-side PII hashing fixtures.
 *
 * The expected SHA-256 hex outputs below are shared BYTE-FOR-BYTE with
 * the server-side test at
 *   bridge-api/microservices/account/nebulr-api/utils/pii-hashing.util.spec.ts.
 *
 * Reddit advanced-matching match rate depends on client and server producing
 * identical hashes for the same raw email. If either side changes
 * normalization (trim/lowercase) or algorithm, the hashes diverge and
 * match rates silently fall — these tests catch that drift.
 */

// SHA-256 hex of "user@example.com"
const USER_AT_EXAMPLE_COM_HASH =
	'b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514';
// SHA-256 hex of "admin@gmail.com"
const ADMIN_AT_GMAIL_COM_HASH =
	'7932b2e116b076a54f452848eaabd5857f61bd957fe8a218faf216f24c9885bb';

// Vitest's `environment: 'node'` exposes the Web Crypto API at
// `globalThis.crypto` (Node 19+), with the same `crypto.subtle.digest()` the
// browser provides and `sha256Email` expects.
describe('sha256Email (client)', () => {
	it('hashes a plain, already-normalized email to the known SHA-256 hex (matches server fixture)', async () => {
		await expect(sha256Email('user@example.com')).resolves.toBe(USER_AT_EXAMPLE_COM_HASH);
	});

	it('trims whitespace and lowercases before hashing — output matches the plain form byte-for-byte', async () => {
		const messy = await sha256Email('  User@Example.COM  ');
		const clean = await sha256Email('user@example.com');
		expect(messy).toBe(clean);
		expect(messy).toBe(USER_AT_EXAMPLE_COM_HASH);
	});

	it('hashes a second fixture email consistently (matches server fixture)', async () => {
		await expect(sha256Email('admin@gmail.com')).resolves.toBe(ADMIN_AT_GMAIL_COM_HASH);
	});

	it('returns undefined for empty string', async () => {
		await expect(sha256Email('')).resolves.toBeUndefined();
	});

	it('returns undefined for null', async () => {
		await expect(sha256Email(null)).resolves.toBeUndefined();
	});

	it('returns undefined for undefined', async () => {
		await expect(sha256Email(undefined)).resolves.toBeUndefined();
	});

	it('returns undefined for whitespace-only input (normalization collapses to empty)', async () => {
		await expect(sha256Email('   ')).resolves.toBeUndefined();
	});
});
