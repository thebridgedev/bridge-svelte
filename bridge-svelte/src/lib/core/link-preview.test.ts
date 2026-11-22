import { afterEach, describe, expect, it } from 'vitest';
import { memoryStorage, readEmailLink } from '@nebulr-group/bridge-auth-core';
import { createFakeIssuer, fakeWebAuthn } from '@nebulr-group/bridge-auth-core/testing';
import { resetClient, startClient } from './client.js';
import { resolveConfig } from './config.js';
import { previewLink } from './link-preview.js';

/** Email links are shown before they are used: one button, nothing spent until it is pressed (TBP-55). */

const PASSWORD = 'correct horse battery';

function setup(options: Parameters<typeof createFakeIssuer>[0] = {}) {
	const fake = createFakeIssuer({ methods: ['password', 'magicLink', 'passkeys'], ...options });
	fake.addPerson({ email: 'alice@acme.test', password: PASSWORD, workspaces: [{ id: 'ws', name: 'Acme' }] });
	const shared = memoryStorage();
	const client = startClient(resolveConfig({ issuer: fake.issuer }, undefined), { fetch: fake.fetch, storage: memoryStorage(), signUpStorage: shared, autoRefresh: false, locks: null, tabChannel: null, live: false, webauthn: fakeWebAuthn() });
	return { fake, client };
}

afterEach(() => resetClient());

describe('looking at a link spends nothing', () => {
	it('a scanner that opens a sign-up link first spoils nothing: the person can still finish', async () => {
		const { fake, client } = setup();
		await client.signUp.start({ email: 'new@acme.test', password: PASSWORD, workspace: true });
		const token = fake.lastLink('new@acme.test', 'verify-sign-up')!;
		expect(await previewLink(token)).toBe('open');
		expect(await previewLink(token)).toBe('open');
		const step = await client.signUp.finish(token);
		expect(step.done || step.next === 'workspace').toBe(true);
	});

	it('a sign-in link, a password link and a passkey setup link survive being looked at', async () => {
		const { fake, client } = setup();
		await client.magicLink.start('alice@acme.test');
		const sign = fake.lastLink('alice@acme.test', 'magic-link')!;
		expect(await previewLink(sign)).toBe('open');
		await expect(client.magicLink.finish(sign)).resolves.toMatchObject({ done: true });

		await client.password.forgot('alice@acme.test');
		const reset = fake.lastLink('alice@acme.test', 'reset-password')!;
		expect(await previewLink(reset)).toBe('open');
		await expect(client.password.set(reset, 'a brand new password')).resolves.toBeUndefined();

		await client.passkeys.setupLink.request('alice@acme.test');
		const passkey = fake.lastLink('alice@acme.test', 'passkey-setup')!;
		expect(await previewLink(passkey)).toBe('open');
		await expect(client.passkeys.setupLink.finish(passkey)).resolves.toMatchObject({ done: true });
	});

	it('says used for a link that was used, and expired for one past its time or unknown', async () => {
		let now = Date.now();
		const { fake, client } = setup({ now: () => now });
		await client.password.forgot('alice@acme.test');
		const used = fake.lastLink('alice@acme.test', 'reset-password')!;
		await client.password.set(used, 'a brand new password');
		expect(await previewLink(used)).toBe('used');
		await client.magicLink.start('alice@acme.test');
		const old = fake.lastLink('alice@acme.test', 'magic-link')!;
		now += 20 * 60 * 1000;
		expect(await previewLink(old)).toBe('expired');
		expect(await previewLink('0123456789abcdefghijkl')).toBe('expired');
	});

	it('takes a link as open when Bridge cannot say, so links sent before the preview still work', async () => {
		const { fake } = setup({ metadata: 'standard' });
		expect(await previewLink('anything')).toBe('open');
		expect(fake.requests.some((each) => each.path.endsWith('/links/preview'))).toBe(false);
	});

	it('keeps the link format: the token is in the fragment, as #bridge=<step>&token=<secret>', () => {
		const secret = '4f9KqL2xP7mN8vB3tY6wZa';
		expect(secret).toHaveLength(22);
		for (const step of ['verify-email', 'magic-link', 'reset-password', 'passkey-setup'] as const) {
			expect(readEmailLink(`https://acme.test/auth/login#bridge=${step}&token=${secret}`)).toEqual({ kind: step, token: secret });
		}
	});
});

describe('the pages a link opens', () => {
	const files = import.meta.glob(['../components/auth/*.svelte', '../components/shared/NoReferrer.svelte'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
	const source = (name: string) => files[`../components/auth/${name}.svelte`] as string;
	/** The code that runs when the page opens, up to the end of onMount. */
	const onMountOf = (text: string) => /onMount\(([\s\S]*?)\n  \}\);/.exec(text)?.[1] ?? '';

	it('the sign-up and sign-in link pages finish nothing when opened: only their button does', () => {
		expect(onMountOf(source('VerifyEmail'))).not.toMatch(/finishSignUp|bounded\(/);
		expect(onMountOf(source('MagicLinkLanding'))).not.toMatch(/magicLink\.finish/);
		expect(source('VerifyEmail')).toMatch(/<LinkConfirm[^>]*onconfirm=\{confirm\}/);
		expect(source('MagicLinkLanding')).toMatch(/<LinkConfirm[^>]*onconfirm=\{confirm\}/);
	});

	it('the passkey setup page uses the link only when its button is pressed', () => {
		expect(onMountOf(source('PasskeySetupLanding'))).not.toMatch(/setupLink\.finish/);
		expect(source('PasskeySetupLanding')).toMatch(/data-bridge-passkey-create onclick=\{create\}/);
	});

	it('every link page says "used" or "expired" with a way to get a new link', () => {
		for (const name of ['VerifyEmail', 'MagicLinkLanding', 'PasskeySetupLanding', 'SetPassword']) expect(source(name), name).toMatch(/<LinkGone/);
		expect(source('LinkGone')).toMatch(/link\.used/);
		expect(source('LinkGone')).toMatch(/link\.expired/);
		expect(source('LinkGone')).toMatch(/link\.getNew/);
	});

	it('tells the browser not to pass the page\'s address on to other sites', () => {
		expect(files['../components/shared/NoReferrer.svelte']).toMatch(/<meta name="referrer" content="no-referrer"/);
		for (const name of ['LinkConfirm', 'LinkGone', 'PasskeySetupLanding', 'SetPassword']) expect(source(name) ?? '', name).toMatch(/NoReferrer/);
	});
});
