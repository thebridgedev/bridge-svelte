import type { Page } from '@playwright/test';
import { expect, signIn, test } from '../../support/fixtures';
import type { Person, TestIssuer } from '../../support/issuer';

/**
 * An action that wants a recent sign-in: the dialog opens over the page, the
 * person confirms it is them in the session they are in, and the action is
 * tried again once. The profile page's save runs through `withRecheck`, and
 * the issuer refuses it as Bridge does when the sign-in is old.
 */
const dialog = '[data-bridge-recheck-dialog]';

/** Signed in, on the profile page with a half-filled form, and the sign-in an hour old. */
async function onProfile(page: Page, issuer: TestIssuer, person: Person) {
	await signIn(page, person.email);
	await page.goto('/settings/profile');
	await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
	await issuer.signedInLongAgo();
	await page.getByTestId('profile-name').fill('Alicia');
	await page.getByTestId('profile-note').fill('typed before the dialog opened');
}

/** How many times the page tried the action. */
function countSaves(page: Page): () => number {
	let saves = 0;
	page.on('request', (request) => {
		if (request.method() === 'PATCH' && new URL(request.url()).pathname === '/v2/accounts/me') saves += 1;
	});
	return () => saves;
}

test.describe('confirming it is you', () => {
	test('a wrong password says so and keeps the dialog; the right one tries the action again, once, on the same page', async ({ page, issuer, person }) => {
		await onProfile(page, issuer, person);
		const saves = countSaves(page);
		const url = page.url();
		await page.getByTestId('profile-save').click();

		await expect(page.locator(dialog)).toBeVisible();
		expect(page.url(), 'an overlay, not a navigation').toBe(url);
		await page.locator('#recheck-password').fill('not the password');
		await page.locator('[data-bridge-recheck-submit]').click();
		await expect(page.locator('[data-bridge-recheck-error]')).toHaveText('That password is not right.');
		await expect(page.locator(dialog)).toBeVisible();
		expect(saves()).toBe(1);

		await page.locator('#recheck-password').fill(person.password);
		await page.locator('[data-bridge-recheck-submit]').click();
		await expect(page.locator(dialog)).toHaveCount(0);
		await expect(page.getByTestId('profile-result')).toHaveText('Saved.');
		expect(saves()).toBe(2);
		expect(page.url()).toBe(url);
		await expect(page.getByTestId('profile-note')).toHaveValue('typed before the dialog opened');
		await expect(page.getByTestId('sign-out'), 'still signed in').toBeVisible();
	});

	test('cancelling leaves the action undone, the form as it was, and the person signed in', async ({ page, issuer, person }) => {
		await onProfile(page, issuer, person);
		const saves = countSaves(page);
		await page.getByTestId('profile-save').click();
		await expect(page.locator(dialog)).toBeVisible();
		await page.locator('[data-bridge-recheck-cancel]').click();
		await expect(page.locator(dialog)).toHaveCount(0);
		await expect(page.getByTestId('profile-result')).toHaveText('Not saved: not confirmed.');
		expect(saves()).toBe(1);
		await expect(page.getByTestId('profile-note')).toHaveValue('typed before the dialog opened');
		await expect(page.getByTestId('profile-name')).toHaveValue('Alicia');
		await expect(page.getByTestId('sign-out')).toBeVisible();
	});

	test('Escape cancels too', async ({ page, issuer, person }) => {
		await onProfile(page, issuer, person);
		await page.getByTestId('profile-save').click();
		await expect(page.locator(dialog)).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.locator(dialog)).toHaveCount(0);
		await expect(page.getByTestId('profile-result')).toHaveText('Not saved: not confirmed.');
	});

	test('offers only the ways the app offers', async ({ page, issuer, person }) => {
		await onProfile(page, issuer, person);
		await page.getByTestId('profile-save').click();
		await expect(page.locator('#recheck-password')).toBeVisible();
		await expect(page.locator('[data-bridge-recheck-email]')).toBeVisible();
		// The app offers passwords and sign-in links, not passkeys.
		await expect(page.locator('[data-bridge-recheck-passkey]')).toHaveCount(0);
	});

	test('a link to the person\'s address: the dialog waits, the link opened in another tab confirms and says to go back, and the action goes on', async ({ page, context, issuer, person }) => {
		await onProfile(page, issuer, person);
		const saves = countSaves(page);
		await page.getByTestId('profile-save').click();
		await page.locator('[data-bridge-recheck-email]').click();
		await expect(page.locator('[data-bridge-recheck-waiting]')).toBeVisible();

		const token = await issuer.lastLink(person.email, 'magic-link');
		const linkTab = await context.newPage();
		await linkTab.goto(`/auth#bridge=magic-link&token=${token}`);
		await expect(linkTab.locator('[data-bridge-magic-link="rechecked"]')).toContainText('Confirmed. You can close this tab and go back.');
		await expect(linkTab, 'it signs nobody in again: no navigation away').toHaveURL(/\/auth\/magic-link/);

		await expect(page.locator(dialog)).toHaveCount(0, { timeout: 20_000 });
		await expect(page.getByTestId('profile-result')).toHaveText('Saved.');
		expect(saves()).toBe(2);
		await expect(page.getByTestId('profile-note')).toHaveValue('typed before the dialog opened');
	});

	test('choosing another way while waiting for the link goes back to the choices', async ({ page, issuer, person }) => {
		await onProfile(page, issuer, person);
		await page.getByTestId('profile-save').click();
		await page.locator('[data-bridge-recheck-email]').click();
		await expect(page.locator('[data-bridge-recheck-waiting]')).toBeVisible();
		await page.locator('[data-bridge-recheck-another]').click();
		await expect(page.locator('#recheck-password')).toBeVisible();
		await expect(page.locator(dialog)).toBeVisible();
	});
});
