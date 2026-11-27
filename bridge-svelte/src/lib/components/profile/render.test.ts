/**
 * The profile components, rendered (on the server renderer, which needs no
 * DOM) once the signed-in person's profile has loaded: `<ProfileName>` must
 * never render empty (it used to), and `<MyProfile>` shows the app's fields
 * and the language picker, in the person's own language.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { get } from 'svelte/store';
import { memoryStorage } from '@nebulr-group/bridge-auth-core';
import { createFakeIssuer } from '@nebulr-group/bridge-auth-core/testing';
import { resetClient, startClient } from '../../core/client.js';
import { resolveConfig } from '../../core/config.js';
import { setUserLocale } from '../../core/i18n.js';
import { me } from '../../core/stores.js';
import ProfileName from '../auth/ProfileName.svelte';
import MyProfile from './MyProfile.svelte';

const PASSWORD = 'correct horse battery';
let stop: (() => void) | null = null;

/** Signed in, with `me` loaded and kept loaded while the test renders. */
async function signedIn(person: Record<string, unknown>) {
	const fake = createFakeIssuer();
	fake.addPerson({ email: 'anna@acme-demo.test', password: PASSWORD, workspaces: [{ id: 'ws-acme', name: 'Acme' }], ...person } as never);
	const client = startClient(resolveConfig({ issuer: fake.issuer }, undefined), { fetch: fake.fetch, storage: memoryStorage(), autoRefresh: false, locks: null, tabChannel: null, live: false });
	await client.signIn.start({ email: 'anna@acme-demo.test', password: PASSWORD });
	stop = me.subscribe(() => undefined);
	for (let i = 0; i < 50 && get(me).value === null; i++) await new Promise((resolve) => setTimeout(resolve, 10));
	expect(get(me).value).not.toBeNull();
	return fake;
}

afterEach(() => {
	stop?.();
	stop = null;
	resetClient();
	setUserLocale(null);
});

describe('<ProfileName>', () => {
	it('shows the signed-in person\'s name', async () => {
		await signedIn({ firstName: 'Anna', lastName: 'Berg' });
		const { body } = render(ProfileName);
		expect(body).toMatch(/data-bridge-profile-name[^>]*>Anna Berg</);
	});

	it('shows the address while the person has no name, never nothing', async () => {
		await signedIn({});
		expect(render(ProfileName).body).toContain('anna@acme-demo.test');
	});
});

describe('<MyProfile>', () => {
	it('shows the names, the app\'s fields and the 12 languages, in the person\'s own language', async () => {
		await signedIn({ firstName: 'Anna', language: 'sv', customFields: [{ label: 'jobTitle', userLabel: 'Job title', type: 'text', value: 'Engineer' }] });
		const { body } = render(MyProfile);
		expect(body).toContain('Min profil');
		expect(body).toContain('Uppgifter');
		expect(body).toMatch(/data-bridge-profile-field="jobTitle"[\s\S]*Job title/);
		expect(body).toContain('id="bridge-profile-first-name"');
		expect((body.match(/<option value="[a-z]{2}"/g) ?? []).length).toBe(12);
		expect(body).toContain('Säkerhetsinställningar');
	});

	it('an app that collects no names shows no name field', async () => {
		await signedIn({ firstName: 'Anna' });
		const { body } = render(MyProfile, { props: { names: false } });
		expect(body).not.toContain('bridge-profile-first-name');
		expect(body).toContain('My profile');
	});
});
