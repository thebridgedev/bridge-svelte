import type { Page } from '@playwright/test';
import { expect, expectTokenGone, PASSWORD, recordRequests, signIn, test, uniqueEmail } from '../../support/fixtures';
import type { Person, TestIssuer } from '../../support/issuer';

/**
 * My profile, the ready-made page (`<MyProfile>` at /settings/my-profile):
 * Details with the app's own field and the person's own language, the email
 * change confirmed in the current inbox and then the new one, "This wasn't
 * me", an address Google manages, and Security settings.
 */

const profile = '[data-bridge-my-profile]';
const email = '[data-bridge-profile-email]';

/** Anna, who works at Acme and has a job title, signed in on My profile. */
async function anna(page: Page, issuer: TestIssuer, extra: Partial<Person> = {}): Promise<Person> {
	const person: Person = {
		email: uniqueEmail('anna'),
		password: PASSWORD,
		firstName: 'Anna',
		lastName: 'Berg',
		customFields: [{ label: 'jobTitle', userLabel: 'Job title', type: 'text', value: 'Engineer' }],
		workspaces: [{ id: 'ws-acme', name: 'Acme', role: 'MEMBER' }],
		...extra,
	};
	await issuer.addPerson(person);
	await signIn(page, person.email);
	await page.goto('/settings/my-profile');
	await expect(page.locator(profile).getByRole('heading', { name: 'My profile' })).toBeVisible();
	return person;
}

async function notices(): Promise<{ to: string; kind: string; newEmail: string }[]> {
	const response = await fetch(`${process.env.E2E_FAKE_CONTROL}/email-notices`);
	return (await response.json()) as { to: string; kind: string; newEmail: string }[];
}

test.describe('My profile', () => {
	test.beforeEach(({ issuer }) => {
		test.skip(issuer.kind === 'real', 'The email change and the app\'s fields are served by the local issuer until Bridge lists them.');
	});

	test('Details: the names and the app\'s field are there; a change shows at once, in the header too', async ({ page, issuer }) => {
		await anna(page, issuer);
		await expect(page.getByTestId('nav-user')).toHaveText('Anna Berg');
		await expect(page.getByLabel('Job title')).toHaveValue('Engineer');
		await expect(page.locator('[data-bridge-profile-save]')).toBeDisabled();

		await page.getByLabel('First name').fill('Annie');
		await page.getByLabel('Job title').fill('Lead engineer');
		await page.locator('[data-bridge-profile-save]').click();
		await expect(page.locator('[data-bridge-profile-saved]')).toHaveText('Your details are saved.');
		await expect(page.getByTestId('nav-user')).toHaveText('Annie Berg');

		await page.reload();
		await expect(page.getByLabel('Job title')).toHaveValue('Lead engineer');
		await expect(page.getByLabel('First name')).toHaveValue('Annie');
	});

	test('an app that collects no names shows no name field', async ({ page, issuer }) => {
		await anna(page, issuer);
		await page.goto('/settings/my-profile?names=0');
		await expect(page.getByLabel('Job title')).toBeVisible();
		await expect(page.getByLabel('First name')).toHaveCount(0);
	});

	test('the person\'s own language: one of the 12, saved to their profile, and the page switches at once', async ({ page, issuer }) => {
		await anna(page, issuer);
		const picker = page.locator('[data-bridge-profile-language]');
		await expect(picker.locator('option')).toHaveCount(13);
		await picker.selectOption('sv');
		const saved = page.waitForRequest((request) => request.method() === 'PATCH' && new URL(request.url()).pathname === '/v2/accounts/me');
		await page.locator('[data-bridge-profile-save]').click();
		expect((await saved).postDataJSON()).toEqual({ language: 'sv' });
		await expect(page.locator(profile).getByRole('heading', { name: 'Min profil' })).toBeVisible();
		await expect(page.locator('[data-bridge-profile-saved]')).toHaveText('Dina uppgifter är sparade.');
		await expect(page.locator('[data-bridge-profile-security] h4')).toHaveText('Säkerhetsinställningar');

		await page.reload();
		await expect(page.locator(profile).getByRole('heading', { name: 'Min profil' })).toBeVisible();
		await expect(picker).toHaveValue('sv');
	});

	test('changing email: the current inbox confirms, then the new one; the old address works until then, and gets "This wasn\'t me"', async ({ page, issuer }) => {
		const person = await anna(page, issuer);
		const next = uniqueEmail('anna-new');
		await page.locator('[data-bridge-profile-email-change]').click();
		await page.locator('[data-bridge-profile-email-new]').fill(next);
		await page.locator('[data-bridge-profile-email-send]').click();
		await expect(page.locator('[data-bridge-profile-email-pending="current"]')).toContainText(`Check your inbox at ${person.email}`);
		await expect(page.locator('[data-bridge-profile-email-current]')).toHaveValue(person.email);

		// The link in the current inbox: one button confirms, and the token leaves the address bar.
		const first = await issuer.lastLink(person.email, 'email-change');
		const requests = recordRequests(page);
		await page.goto(`/auth/email-change#bridge=email-change&token=${first}`);
		await page.locator('[data-bridge-email-link-confirm]').click();
		await expect(page.locator('[data-bridge-email-link-result]')).toHaveText("Thank you. If the new address can be used, we've sent it a link. Open it to finish the change.");
		await expectTokenGone(page, first, requests);

		await page.goto('/settings/my-profile');
		await expect(page.locator('[data-bridge-profile-email-pending="new"]')).toContainText(`If ${next} can be used`);

		const second = await issuer.lastLink(next, 'email-change');
		await page.goto(`/auth/email-change#bridge=email-change&token=${second}`);
		await page.locator('[data-bridge-email-link-confirm]').click();
		await expect(page.locator('[data-bridge-email-link-result]')).toHaveText(`Your email address is now ${next}.`);

		await page.goto('/settings/my-profile');
		await expect(page.locator('[data-bridge-profile-email-current]')).toHaveValue(next);
		expect(await notices()).toContainEqual({ to: person.email, kind: 'changed', newEmail: next });
	});

	test('"This wasn\'t me" puts the old address back, signs every device out, and a password link goes to it', async ({ page, issuer }) => {
		const person = await anna(page, issuer);
		const next = uniqueEmail('anna-new');
		await page.locator('[data-bridge-profile-email-change]').click();
		await page.locator('[data-bridge-profile-email-new]').fill(next);
		await page.locator('[data-bridge-profile-email-send]').click();
		await expect(page.locator('[data-bridge-profile-email-pending="current"]')).toBeVisible();
		for (const to of [person.email, next]) {
			const token = await issuer.lastLink(to, 'email-change');
			// Each link opens a page of its own, as from the inbox.
			await page.goto('/');
			await page.goto(`/auth/email-change#bridge=email-change&token=${token}`);
			await page.locator('[data-bridge-email-link-confirm]').click();
			await expect(page.locator('[data-bridge-email-link-result]')).toBeVisible();
		}

		const revert = await issuer.lastLink(person.email, 'email-revert');
		await page.goto(`/auth/email-revert#bridge=email-revert&token=${revert}`);
		await expect(page.getByRole('heading', { name: "This wasn't me" })).toBeVisible();
		await page.locator('[data-bridge-email-link-confirm]').click();
		await expect(page.locator('[data-bridge-email-link-result]')).toHaveText("Your old address is back, and every device is signed out. We've sent a link to set a new password.");
		await expect(page.getByTestId('nav-sign-in')).toBeVisible();
		expect(await issuer.lastLink(person.email, 'reset-password')).toBeTruthy();
	});

	test('signed in an hour ago: changing email asks to confirm it is you first, then the change goes on', async ({ page, issuer }) => {
		const person = await anna(page, issuer);
		await issuer.signedInLongAgo();
		await page.locator('[data-bridge-profile-email-change]').click();
		await page.locator('[data-bridge-profile-email-new]').fill(uniqueEmail('anna-new'));
		await page.locator('[data-bridge-profile-email-send]').click();
		await expect(page.locator('[data-bridge-recheck-dialog]')).toBeVisible();
		await page.locator('#recheck-password').fill(person.password);
		await page.locator('[data-bridge-recheck-submit]').click();
		await expect(page.locator('[data-bridge-recheck-dialog]')).toHaveCount(0);
		await expect(page.locator('[data-bridge-profile-email-pending="current"]')).toBeVisible();
	});

	test('a new address that already has an account gets the same words and no link', async ({ page, issuer }) => {
		const person = await anna(page, issuer);
		const taken = uniqueEmail('taken');
		await issuer.addPerson({ email: taken, password: PASSWORD });
		await page.locator('[data-bridge-profile-email-change]').click();
		await page.locator('[data-bridge-profile-email-new]').fill(taken);
		await page.locator('[data-bridge-profile-email-send]').click();
		await expect(page.locator('[data-bridge-profile-email-pending="current"]')).toBeVisible();
		const first = await issuer.lastLink(person.email, 'email-change');
		await page.goto(`/auth/email-change#bridge=email-change&token=${first}`);
		await page.locator('[data-bridge-email-link-confirm]').click();
		await expect(page.locator('[data-bridge-email-link-result]')).toHaveText("Thank you. If the new address can be used, we've sent it a link. Open it to finish the change.");
		await expect(issuer.lastLink(taken, 'email-change')).rejects.toThrow(/404/);
	});

	test('a used link explains itself; a wrong address is caught before asking; the change can be cancelled', async ({ page, issuer }) => {
		const person = await anna(page, issuer);
		await page.locator('[data-bridge-profile-email-change]').click();
		await page.locator('[data-bridge-profile-email-new]').fill('not an address');
		await page.locator('[data-bridge-profile-email-send]').click();
		await expect(page.locator('[data-bridge-profile-email-error]')).toHaveText('Enter a valid email address.');
		await page.locator('[data-bridge-profile-email-new]').fill(uniqueEmail('anna-new'));
		await page.locator('[data-bridge-profile-email-send]').click();
		await page.locator('[data-bridge-profile-email-cancel-change]').click();
		await expect(page.locator(email)).toHaveAttribute('data-bridge-profile-email', 'ready');

		const cancelled = await issuer.lastLink(person.email, 'email-change');
		await page.goto(`/auth/email-change#bridge=email-change&token=${cancelled}`);
		await page.locator('[data-bridge-email-link-confirm]').click();
		await expect(page.locator('[data-bridge-email-link]')).toHaveAttribute('data-error-kind', 'link-invalid');
	});

	test('someone who signs in with Google sees "Managed by Google", and no way to change it here', async ({ page, issuer }) => {
		await anna(page, issuer, { managedBy: 'google' });
		await expect(page.locator('[data-bridge-profile-email-managed]')).toContainText('Managed by Google');
		await expect(page.locator('[data-bridge-profile-email-change]')).toHaveCount(0);
	});

	test('Security settings: a link to set a new password goes to the person\'s own address', async ({ page, issuer }) => {
		const person = await anna(page, issuer);
		await page.locator('[data-bridge-profile-password-send]').click();
		await expect(page.locator('[data-bridge-profile-password-sent]')).toHaveText(`A link to set a new password is on its way to ${person.email}.`);
		expect(await issuer.lastLink(person.email, 'reset-password')).toBeTruthy();
	});
});
