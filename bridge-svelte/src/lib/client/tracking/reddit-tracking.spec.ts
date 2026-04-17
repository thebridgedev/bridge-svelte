import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { configureRedditTracking, pushConversionEvent } from './reddit-tracking.js';

/**
 * Unit tests for the shared dataLayer push util.
 *
 * The util lives in bridge-svelte and is consumed by cloud-views, admin-ui,
 * and the marketing site — so its contract (gate, payload shape, ecommerce
 * cleanup push, conversion_id propagation) has to stay stable.
 *
 * vitest runs these in a `node` environment, so we manually install a
 * browser-like `window` + `window.dataLayer` shim per test and tear it down
 * afterwards.
 */

type DataLayerEntry = Record<string, unknown>;

function installWindow(dataLayer: DataLayerEntry[] | undefined): void {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any).window = { dataLayer } as unknown as Window;
}

function uninstallWindow(): void {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	delete (globalThis as any).window;
}

describe('pushConversionEvent', () => {
	beforeEach(() => {
		// Reset the module-level gate between tests.
		configureRedditTracking(undefined);
	});

	afterEach(() => {
		uninstallWindow();
		configureRedditTracking(undefined);
	});

	it('no-ops when the configured gate returns false', () => {
		const dl: DataLayerEntry[] = [];
		installWindow(dl);

		configureRedditTracking(() => false);

		pushConversionEvent('SignUp', {
			user_data: { email_address: 'hash-abc' },
			conversion_id: 'cid-1'
		});

		expect(dl).toHaveLength(0);
	});

	it('no-ops when window is missing (SSR / non-browser context)', () => {
		// No installWindow — globalThis.window is undefined.
		configureRedditTracking(() => true);

		// Must not throw.
		expect(() => pushConversionEvent('SignUp', { conversion_id: 'cid-ssr' })).not.toThrow();
	});

	it('no-ops when window.dataLayer is missing', () => {
		installWindow(undefined);
		configureRedditTracking(() => true);

		// Must not throw.
		expect(() => pushConversionEvent('SignUp', { conversion_id: 'cid-no-dl' })).not.toThrow();
	});

	it('pushes a full conversion payload when gate returns true — event, user_data, ecommerce (with cleanup push), signup_method, conversion_id', () => {
		const dl: DataLayerEntry[] = [];
		installWindow(dl);
		configureRedditTracking(() => true);

		pushConversionEvent('Purchase', {
			user_data: { email_address: 'hash-abc' },
			ecommerce: {
				value: 29,
				currency: 'USD',
				items: [
					{ item_id: 'premium', item_name: 'Premium Monthly', price: 29, quantity: 1 }
				]
			},
			signup_method: 'email',
			conversion_id: 'cid-purchase-1'
		});

		// ecommerce cleanup push MUST come first, then the real event payload
		expect(dl).toHaveLength(2);
		expect(dl[0]).toEqual({ ecommerce: null });

		const payload = dl[1];
		expect(payload.event).toBe('Purchase');
		expect(payload.user_data).toEqual({ email_address: 'hash-abc' });
		expect(payload.ecommerce).toMatchObject({
			value: 29,
			currency: 'USD'
		});
		expect(payload.signup_method).toBe('email');
		expect(payload.conversion_id).toBe('cid-purchase-1');
	});

	it('propagates conversion_id through to the pushed payload', () => {
		const dl: DataLayerEntry[] = [];
		installWindow(dl);
		configureRedditTracking(() => true);

		pushConversionEvent('SignUp', { conversion_id: 'my-shared-uuid' });

		expect(dl).toHaveLength(1);
		expect(dl[0].conversion_id).toBe('my-shared-uuid');
	});

	it('omits user_data from payload when provided as an empty object', () => {
		const dl: DataLayerEntry[] = [];
		installWindow(dl);
		configureRedditTracking(() => true);

		pushConversionEvent('Lead', { user_data: {}, conversion_id: 'cid-lead' });

		expect(dl).toHaveLength(1);
		const payload = dl[0];
		expect(payload.event).toBe('Lead');
		expect('user_data' in payload).toBe(false);
		expect(payload.conversion_id).toBe('cid-lead');
	});

	it('omits signup_method when the option is undefined or empty string', () => {
		const dl: DataLayerEntry[] = [];
		installWindow(dl);
		configureRedditTracking(() => true);

		pushConversionEvent('SignUp', { conversion_id: 'cid-sm-undefined' });
		pushConversionEvent('SignUp', { signup_method: '', conversion_id: 'cid-sm-empty' });

		expect(dl).toHaveLength(2);
		expect('signup_method' in dl[0]).toBe(false);
		expect('signup_method' in dl[1]).toBe(false);
	});

	it('omits conversion_id from payload when the option is undefined or empty string', () => {
		const dl: DataLayerEntry[] = [];
		installWindow(dl);
		configureRedditTracking(() => true);

		pushConversionEvent('SignUp');
		pushConversionEvent('SignUp', { conversion_id: '' });

		expect(dl).toHaveLength(2);
		expect('conversion_id' in dl[0]).toBe(false);
		expect('conversion_id' in dl[1]).toBe(false);
	});

	it('pushes without gate-check when no gate is configured', () => {
		const dl: DataLayerEntry[] = [];
		installWindow(dl);

		// No configureRedditTracking call — default is "allow all".
		pushConversionEvent('PageVisit', { conversion_id: 'cid-pv' });

		expect(dl).toHaveLength(1);
		expect(dl[0].event).toBe('PageVisit');
	});

	it('emits the ecommerce cleanup push only when ecommerce option is provided', () => {
		const dl: DataLayerEntry[] = [];
		installWindow(dl);
		configureRedditTracking(() => true);

		pushConversionEvent('SignUp', { conversion_id: 'cid-no-ecom' });

		expect(dl).toHaveLength(1);
		expect(dl[0]).not.toEqual({ ecommerce: null });
	});
});
