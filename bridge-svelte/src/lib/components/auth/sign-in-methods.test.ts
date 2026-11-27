import { describe, expect, it } from 'vitest';
import { BridgeError, readEmailLink } from '@nebulr-group/bridge-auth-core';
import { createFakeIssuer, fakeWebAuthn } from '@nebulr-group/bridge-auth-core/testing';
import { render } from 'svelte/server';
import { memoryStorage } from '@nebulr-group/bridge-auth-core';
import { continueOnAppPage, handOff, heldReturn, safeReturn } from './finish-link.js';
import { authPageAt, pageForLink, parseAuthPage } from '../../core/routes.js';
import { resolveConfig } from '../../core/config.js';
import { decide } from '../../core/guard.js';
import { errorMessage, setAppCopy, translator } from '../../core/i18n.js';
import { startClient, resetClient } from '../../core/client.js';
import ReturnContinue from './ReturnContinue.svelte';

/** The app's own sign-in path, passkeys on the app's page, the Continue click, and passwords that must change. */

const files = import.meta.glob('./*.svelte', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const source = (name: string) => files[`./${name}.svelte`] as string;

describe('the app\'s own sign-in path, /auth/login, is served', () => {
	it('serves the sign-in page at login, as the page email links and sign-outs name', () => {
		expect(parseAuthPage('login')).toBe('sign-in');
		expect(parseAuthPage('/login')).toBe('sign-in');
		expect(parseAuthPage('sign-in')).toBe('sign-in');
		expect(parseAuthPage('login/extra')).toBeNull();
		const config = resolveConfig({ issuer: 'https://bridge.test/identity-access/apps/a' }, undefined);
		expect(authPageAt('/auth/login', config.authBase)).toBe('sign-in');
	});

	it('a signed-in person on /auth/login is sent on, as on the sign-in page', () => {
		const config = resolveConfig({ issuer: 'https://bridge.test/identity-access/apps/a' }, undefined);
		const input = { path: '/auth/login', target: '/auth/login', session: { status: 'signed-in', user: { id: 'u', email: 'a@b.c', emailVerified: true }, workspace: null } as never, flags: { enabled: () => false }, returnTo: null };
		expect(decide(config, input)).toMatchObject({ type: 'redirect', reason: 'signed-in' });
	});

	it('an email link that lands on /auth/login goes on to its own page, with the fragment', () => {
		const link = readEmailLink('https://app.acme.test/auth/login#bridge=reset-password&token=4f9KqL2xP7mN8vB3tY6wZa');
		expect(link).toEqual({ kind: 'reset-password', token: '4f9KqL2xP7mN8vB3tY6wZa' });
		expect(pageForLink(link!)).toBe('set-password');
	});
});

describe('a passkey sign-in on Bridge\'s own page goes to the app\'s sign-in page', () => {
	const handedOver = new BridgeError('conflict', 'x', { status: 409, code: 'passkey_on_app_page', signInUrl: 'https://app.acme.test/auth/login' });

	it('goes there when Bridge hands the passkey over', () => {
		const went: string[] = [];
		expect(continueOnAppPage(handedOver, (url) => went.push(url))).toBe(true);
		expect(went).toEqual(['https://app.acme.test/auth/login']);
	});

	it('goes nowhere for any other error, or an address that is not http(s)', () => {
		const went: string[] = [];
		expect(continueOnAppPage(new BridgeError('conflict', 'x', { code: 'passkey_exists' }), (url) => went.push(url))).toBe(false);
		expect(continueOnAppPage(new BridgeError('conflict', 'x', { code: 'passkey_on_app_page', signInUrl: 'javascript:alert(1)' }), (url) => went.push(url))).toBe(false);
		expect(continueOnAppPage(new Error('x'), (url) => went.push(url))).toBe(false);
		expect(went).toEqual([]);
	});

	it('is started by the passkey button only: the wait for the autofill list ends quietly', () => {
		const form = source('SignInForm');
		expect(form).toMatch(/async function signInWithPasskey\(\)[\s\S]*?continueOnAppPage\(error\)/);
		const autofill = /async function startAutofill\(\)[\s\S]*?\n  \}\n/.exec(form)?.[0] ?? '';
		expect(autofill).not.toMatch(/continueOnAppPage/);
		expect(autofill).toMatch(/passkeyHandOverTo\(error\) === null/);
	});
});

describe('passkeys made on the old page are told about', () => {
	it('the passkey list says so for each, and above the list', () => {
		const manager = source('PasskeyManager');
		expect(manager).toMatch(/passkeys\.some\(\(each\) => !each\.usable\)/);
		expect(manager).toMatch(/passkey\.unusableNotice/);
		expect(manager).toMatch(/\{#if !passkey\.usable\}[\s\S]*?passkey\.unusable/);
		// A new one can be added next to them: the add form is still there.
		expect(manager).toMatch(/data-bridge-passkey-add/);
	});

	it('the copy tells people what to do in every language', () => {
		for (const locale of ['en', 'sv', 'da', 'nb', 'nl', 'de', 'fi', 'fr', 'es', 'it', 'pt', 'pl']) {
			setAppCopy(locale, {});
			const t = translator();
			expect(t('passkey.unusableNotice'), locale).not.toBe('');
			expect(t('passkey.unusable'), locale).not.toBe('');
			expect(t('passkey.handover'), locale).not.toBe('');
		}
		setAppCopy(undefined, {});
	});
});

describe('a return to localhost in production asks for a click', () => {
	const held = { done: true as const, handoff: 'http://127.0.0.1:53123/callback?code=c&state=s', confirmReturn: true as const };

	it('holds the return instead of going back, and goes back only on the click', () => {
		const went: string[] = [];
		expect(handOff(held, (url) => went.push(url))).toBe(false);
		expect(went).toEqual([]);
		expect(heldReturn(held)).toBe(held.handoff);
		expect(handOff({ done: true, handoff: held.handoff }, (url) => went.push(url))).toBe(true);
		expect(heldReturn({ done: true, handoff: held.handoff })).toBeNull();
	});

	it('shows a Continue button that goes nowhere by itself', () => {
		const out = render(ReturnContinue, { props: { url: held.handoff } }).body;
		expect(out).toContain('data-bridge-return-continue');
		expect(out).toContain('Continue');
		expect(out).toContain('Press Continue to go back.');
		expect(source('ReturnContinue')).not.toMatch(/onMount|\$effect/);
		expect(render(ReturnContinue, { props: { url: 'javascript:alert(1)' } }).body).toMatch(/data-bridge-return-continue[^>]*disabled/);
		expect(safeReturn('https://user:pw@x.test/')).toBeNull();
	});

	it('the sign-in form and both link pages show it', () => {
		for (const name of ['SignInForm', 'MagicLinkLanding', 'VerifyEmail']) {
			expect(source(name), name).toMatch(/heldReturn\(step\)/);
			expect(source(name), name).toMatch(/<ReturnContinue/);
		}
	});

	it('works end to end: a sign-in on a request comes back with confirmReturn, held until the click', async () => {
		const fake = createFakeIssuer({ returns: ['http://127.0.0.1:53123/callback'], confirmReturn: true });
		fake.addPerson({ email: 'anna@acme.test', password: 'correct horse battery', workspaces: [{ id: 'ws', name: 'Acme' }] });
		const client = startClient(resolveConfig({ issuer: fake.issuer }, undefined), { fetch: fake.fetch, storage: memoryStorage(), autoRefresh: false, locks: null, tabChannel: null, live: false, webauthn: fakeWebAuthn() });
		const started = await fake.fetch(`${fake.issuer.replace('/identity-access/', '/v2/identity-access/')}/sign-in-requests`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', code_challenge_method: 'S256', redirect_uri: 'http://127.0.0.1:53123/callback', state: 'state-0001' }) });
		await client.request.use(((await started.json()) as { request: string }).request);
		const step = await client.signIn.start({ email: 'anna@acme.test', password: 'correct horse battery' });
		expect(heldReturn(step)).toContain('http://127.0.0.1:53123/callback');
		expect(handOff(step, () => undefined)).toBe(false);
		resetClient();
	});
});

describe('a password that no longer meets the rules is routed to choosing a new one', () => {
	const changed = new BridgeError('forbidden', 'x', { status: 403, code: 'password_change_required', failed: ['minLength'] });

	it('is told in the app\'s language, not as a wrong password', () => {
		expect(errorMessage(changed, translator())).toBe("Your password no longer meets this app's rules. We have emailed you a link to choose a new one.");
		setAppCopy('sv', {});
		expect(errorMessage(changed, translator())).toBe('Ditt lösenord uppfyller inte längre appens regler. Vi har mejlat en länk där du väljer ett nytt.');
		setAppCopy(undefined, {});
		expect(errorMessage(new BridgeError('wrong-credentials', 'x'), translator())).toBe('Invalid email or password.');
	});

	it('the sign-in form shows the choose-a-new-password step with a way to send the link again', () => {
		const form = source('SignInForm');
		expect(form).toMatch(/isPasswordChangeRequired\(error\)\) mustChoose = isPasswordExpired\(error\) \? 'expired' : 'asked'/);
		expect(form).toMatch(/data-bridge-sign-in-step="password-change"/);
		expect(form).toMatch(/async function resendChoose\(\)[\s\S]*?password\.forgot\(email\.trim\(\)\)/);
		expect(form).toMatch(/\/forgot-password/);
	});

	it('works end to end: the link that was sent opens the set-password page, and the new password signs in', async () => {
		const fake = createFakeIssuer();
		fake.addPerson({ email: 'anna@acme.test', password: 'correct horse battery', workspaces: [{ id: 'ws', name: 'Acme' }] });
		fake.requirePasswordChange('anna@acme.test');
		const client = startClient(resolveConfig({ issuer: fake.issuer }, undefined), { fetch: fake.fetch, storage: memoryStorage(), autoRefresh: false, locks: null, tabChannel: null, live: false });
		const refused = await client.signIn.start({ email: 'anna@acme.test', password: 'correct horse battery' }).catch((caught: unknown) => caught);
		expect(errorMessage(refused, translator())).toContain('no longer meets');
		const token = fake.lastLink('anna@acme.test', 'reset-password')!;
		expect(pageForLink({ kind: 'reset-password', token })).toBe('set-password');
		await client.password.set(token, 'a much longer password 123');
		await expect(client.signIn.start({ email: 'anna@acme.test', password: 'a much longer password 123' })).resolves.toMatchObject({ done: true });
		resetClient();
	});
});
