/**
 * My profile: the details it saves, the email change behind the "confirm it
 * is you" dialog, and the link pages, against auth-core's fake issuer. The
 * page itself runs in the demo's Playwright suite (tests/profile).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';
import { BridgeError, memoryStorage, type Me } from '@nebulr-group/bridge-auth-core';
import { createFakeIssuer } from '@nebulr-group/bridge-auth-core/testing';
import { getBridge, resetClient, startClient } from './client.js';
import { resolveConfig } from './config.js';
import { errorMessage, setAppCopy, setUserLocale, translator } from './i18n.js';
import { PLUGIN_LOCALES } from './messages.js';
import { cancelEmailChange, detailsChange, formOf, loadLogin, newEmailProblem, PROFILE_LANGUAGES, providerName, saveDetails, startEmailChange } from './profile.js';
import { cancelRecheck, recheckRequest, type RecheckRequest } from './recheck.js';
import { AUTH_PAGES, pageForLink, parseAuthPage } from './routes.js';

const PASSWORD = 'correct horse battery';

async function annaSignedIn(person: Partial<Parameters<ReturnType<typeof createFakeIssuer>['addPerson']>[0]> = {}) {
	const fake = createFakeIssuer({ methods: ['password', 'magicLink', 'passkeys'] });
	fake.addPerson({ email: 'anna@acme-demo.test', password: PASSWORD, firstName: 'Anna', lastName: 'Berg', workspaces: [{ id: 'ws-acme', name: 'Acme', role: 'MEMBER' }], ...person });
	const client = startClient(resolveConfig({ issuer: fake.issuer }, undefined), {
		fetch: fake.fetch,
		storage: memoryStorage(),
		signUpStorage: memoryStorage(),
		autoRefresh: false,
		locks: null,
		tabChannel: null,
		live: false,
	});
	await client.signIn.start({ email: person.email ?? 'anna@acme-demo.test', password: PASSWORD });
	return { fake, client };
}

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
	setUserLocale(null);
	setAppCopy(undefined, {});
});

const anna: Pick<Me, 'firstName' | 'lastName' | 'phoneNumber' | 'language' | 'customFields'> = {
	firstName: 'Anna',
	lastName: 'Berg',
	phoneNumber: null,
	language: null,
	customFields: [
		{ label: 'jobTitle', userLabel: 'Job title', type: 'text', value: 'Engineer' },
		{ label: 'employeeId', type: 'text', value: 'E-1', editable: false },
	],
};

describe('Details', () => {
	it('sends only what changed, never a read-only field, and names only when the form shows them', () => {
		const form = { ...formOf(anna), firstName: ' Annie ', fields: { jobTitle: 'Lead', employeeId: 'E-9' } };
		expect(detailsChange(anna, form, { names: true, phone: false })).toEqual({ firstName: 'Annie', customFields: [{ label: 'jobTitle', value: 'Lead' }] });
		expect(detailsChange(anna, form, { names: false, phone: false })).toEqual({ customFields: [{ label: 'jobTitle', value: 'Lead' }] });
		expect(detailsChange(anna, formOf(anna), { names: true, phone: true })).toEqual({});
		expect(detailsChange(anna, { ...formOf(anna), language: 'sv' }, { names: true, phone: false })).toEqual({ language: 'sv' });
		expect(detailsChange({ ...anna, language: 'sv' }, { ...formOf(anna), language: '' }, { names: true, phone: false })).toEqual({ language: null });
	});

	it('a number field\'s input gives a number: it is sent as text, and an unchanged one is not sent', () => {
		const counted = { ...anna, customFields: [{ label: 'seats', type: 'integer', value: '3', editable: true }] };
		const typed = (value: unknown) => ({ ...formOf(counted), fields: { seats: value as string } });
		expect(detailsChange(counted, typed(4), { names: true, phone: false })).toEqual({ customFields: [{ label: 'seats', value: '4' }] });
		expect(detailsChange(counted, typed(3), { names: true, phone: false })).toEqual({});
		expect(detailsChange(counted, typed(null), { names: true, phone: false })).toEqual({ customFields: [{ label: 'seats', value: '' }] });
	});

	it('offers the 12 screen languages, each in its own words, the ones the plugin has copy for', () => {
		expect(PROFILE_LANGUAGES.map((each) => each.code).sort()).toEqual(Object.keys(PLUGIN_LOCALES).sort());
		expect(PROFILE_LANGUAGES.find((each) => each.code === 'sv')?.name).toBe('Svenska');
	});

	it('saves the person\'s own language and the app\'s field with PATCH /me, and `me` reads them back', async () => {
		const { fake } = await annaSignedIn({ customFields: [{ label: 'jobTitle', userLabel: 'Job title', type: 'text', value: 'Engineer' }] });
		await expect(saveDetails({ language: 'de', customFields: [{ label: 'jobTitle', value: 'Lead' }] })).resolves.toMatchObject({ language: 'de' });
		const patch = fake.requests.filter((each) => each.method === 'PATCH' && each.path === '/v2/accounts/me').at(-1);
		expect(patch?.body).toEqual({ language: 'de', customFields: [{ label: 'jobTitle', value: 'Lead' }] });
		await expect(getBridge().me.get()).resolves.toMatchObject({ language: 'de', customFields: [{ value: 'Lead' }] });
	});

	it('shows the chosen language at once: a component\'s own locale wins, then the app\'s, then the person\'s', () => {
		expect(translator(undefined, 'sv')('profile.heading')).toBe('Min profil');
		setUserLocale('de');
		expect(translator()('profile.heading')).toBe('Mein Profil');
		setAppCopy('fr', {});
		expect(translator()('profile.heading')).toBe('Mon profil');
	});
});

describe('Email', () => {
	it('reads the login, asks for the change, and shows it waiting for the current inbox; cancelling ends it', async () => {
		const { fake } = await annaSignedIn();
		await expect(loadLogin()).resolves.toMatchObject({ email: 'anna@acme-demo.test', emailChangeable: true, pendingChange: null });
		await expect(startEmailChange('anna@newmail-demo.test')).resolves.toMatchObject({ email: 'anna@acme-demo.test', pendingChange: { newEmail: 'anna@newmail-demo.test', stage: 'current' } });
		expect(fake.lastLink('anna@acme-demo.test', 'email-change')).not.toBeNull();
		await expect(cancelEmailChange()).resolves.toMatchObject({ pendingChange: null });
	});

	it('signed in more than 10 minutes ago: the "confirm it is you" dialog opens, and once confirmed the change goes on', async () => {
		const { fake } = await annaSignedIn();
		fake.signedInLongAgo();
		const started = startEmailChange('anna@newmail-demo.test');
		const dialog = await opened();
		await getBridge().recheck.password(PASSWORD);
		dialog.confirmed();
		await expect(started).resolves.toMatchObject({ pendingChange: { stage: 'current' } });
		expect(get(recheckRequest)).toBeNull();
	});

	it('a cancelled check changes nothing', async () => {
		const { fake } = await annaSignedIn();
		fake.signedInLongAgo();
		const started = startEmailChange('anna@newmail-demo.test');
		(await opened()).cancelled();
		await expect(started).rejects.toMatchObject({ kind: 'cancelled' });
		expect(fake.lastLink('anna@acme-demo.test', 'email-change')).toBeNull();
	});

	it('Google\'s address is "Managed by Google", and a refusal says it is changed there', async () => {
		await annaSignedIn({ email: 'sam@acme-demo.test', managedBy: 'google' });
		await expect(loadLogin()).resolves.toMatchObject({ emailChangeable: false, managedBy: 'google' });
		const refused = await startEmailChange('sam@new.test').catch((error: unknown) => error);
		expect(errorMessage(refused, translator())).toBe('You sign in with Google, so your email address is changed there.');
		expect(translator()('profile.email.managed', { provider: providerName('google') })).toBe('Managed by Google');
		expect(providerName('azure')).toBe('Microsoft');
		expect(providerName('Acme SSO')).toBe('Acme SSO');
	});

	it('checks the new address before asking', () => {
		expect(newEmailProblem('anna@acme.test', 'nope')).toBe('invalid');
		expect(newEmailProblem('anna@acme.test', ' ANNA@acme.test ')).toBe('same');
		expect(newEmailProblem('anna@acme.test', 'anna@new.test')).toBeNull();
	});
});

describe('the links', () => {
	it('email-change and email-revert are pages of their own, where the hosted page and the auth routes serve them', () => {
		expect(AUTH_PAGES).toContain('email-change');
		expect(AUTH_PAGES).toContain('email-revert');
		expect(pageForLink({ kind: 'email-change', token: 't' })).toBe('email-change');
		expect(pageForLink({ kind: 'email-revert', token: 't' })).toBe('email-revert');
		expect(parseAuthPage('email-revert')).toBe('email-revert');
		const routes = readFileSync(new URL('../components/auth/BridgeAuthRoutes.svelte', import.meta.url), 'utf8');
		expect(routes).toMatch(/p === 'email-change' \|\| p === 'email-revert'[\s\S]*<EmailChangeLanding kind=\{p\}/);
	});

	it('the confirmation\'s words never say whether the new address has an account', () => {
		for (const [locale, copy] of Object.entries(PLUGIN_LOCALES)) {
			expect(copy['emailChange.next'], locale).not.toMatch(/\{email\}/);
			expect(copy['profile.email.checkNew'], locale).toContain('{email}');
		}
		expect(translator()('emailChange.next')).toBe("Thank you. If the new address can be used, we've sent it a link. Open it to finish the change.");
		expect(translator()('emailRevert.done')).toBe("Your old address is back, and every device is signed out. We've sent a link to set a new password.");
	});

	it('an expired or used link explains itself', () => {
		expect(errorMessage(new BridgeError('link-invalid', 'x'), translator(), 'link.error.invalid')).toBe(translator()('link.error.invalid'));
	});
});
