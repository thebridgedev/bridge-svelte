import type { Page } from '@playwright/test';
import { expect, PASSWORD, test, uniqueEmail } from '../../support/fixtures';

/**
 * Enter submits every end-user sign-in form, once, and nothing submits by itself (TBP-828): pressed in a real
 * browser on each screen of the demo, which draws the plugin's own forms.
 */

/** Counts the POSTs to a path of the issuer, held for a moment so a second press lands while the first is on its way. */
function heldPosts(page: Page, path: RegExp, holdMs = 700) {
	const seen: string[] = [];
	void page.route(path, async (route) => {
		if (route.request().method() !== 'POST') return route.continue();
		seen.push(route.request().url());
		await new Promise((done) => setTimeout(done, holdMs));
		await route.continue();
	});
	return seen;
}

test.describe('Enter submits every sign-in form', () => {
	test('sign-in: Enter in the password field signs in', async ({ page, person }) => {
		await page.goto('/auth/sign-in');
		await page.locator('#login-email').fill(person.email);
		await page.locator('#login-password').fill(person.password);
		await page.locator('#login-password').press('Enter');
		await expect(page.getByTestId('sign-out')).toBeVisible();
	});

	test('sign-in: Enter pressed twice sends one request, and the button shows it is busy', async ({ page, person }) => {
		await page.goto('/auth/sign-in');
		await page.locator('#login-email').fill(person.email);
		await page.locator('#login-password').fill(person.password);
		const posts = heldPosts(page, /\/sign-in$/);
		await page.locator('#login-password').press('Enter');
		await page.locator('#login-password').press('Enter').catch(() => undefined);
		await expect(page.locator('[data-bridge-sign-in-step="credentials"] button[type="submit"]')).toBeDisabled();
		await expect(page.getByTestId('sign-out')).toBeVisible();
		expect(posts).toHaveLength(1);
	});

	test('sign-up: Enter sends the sign-up', async ({ page }) => {
		const email = uniqueEmail('enter');
		await page.goto('/auth/sign-up');
		await page.locator('#signup-first-name').fill('Sam');
		await page.locator('#signup-email').fill(email);
		await page.locator('#signup-password').fill(PASSWORD);
		await page.locator('#signup-password').press('Enter');
		await expect(page.locator('[data-bridge-sign-up-sent]')).toContainText(email);
	});

	test('forgot password and set password: Enter sends each', async ({ page, issuer, person }) => {
		await page.goto('/auth/forgot-password');
		await page.locator('#forgot-email').fill(person.email);
		await page.locator('#forgot-email').press('Enter');
		await expect(page.locator('[data-bridge-forgot-password="sent"]')).toBeVisible();
		const token = await issuer.lastLink(person.email, 'reset-password');
		await page.goto(`/auth#bridge=reset-password&token=${token}`);
		await expect(page.locator('[data-bridge-set-password="form"]')).toBeVisible();
		await page.locator('#set-password').fill('a brand new passphrase');
		await page.locator('#set-password-confirm').fill('a brand new passphrase');
		await page.locator('#set-password-confirm').press('Enter');
		await expect(page.locator('[data-bridge-set-password="done"]')).toBeVisible();
	});

	test('the second step: the phone setup and the code go on Enter only, never by themselves when the last digit is typed', async ({ page, issuer }) => {
		const email = uniqueEmail('mfa');
		await issuer.addPerson({ email, password: PASSWORD, workspaces: [{ id: 'ws-mfa', name: 'Locked', role: 'OWNER', mfa: true }] });
		await page.goto('/auth/sign-in');
		await page.locator('#login-email').fill(email);
		await page.locator('#login-password').fill(PASSWORD);
		await page.locator('#login-password').press('Enter');
		// First time: the number to set up, in the country picker (TBP-830).
		await expect(page.locator('[data-bridge-second-step="second_step_setup"]')).toBeVisible();
		await page.locator('[data-bridge-phone-country]').click();
		await page.locator('[data-bridge-phone-search]').fill('united kingdom');
		await page.locator('[data-bridge-phone-search]').press('Enter');
		await expect(page.locator('[data-bridge-phone-country]')).toHaveAttribute('data-bridge-phone-country', 'GB');
		// Enter in the search box chose the country; it sent nothing.
		await expect(page.locator('[data-bridge-second-step="second_step_setup"]')).toBeVisible();
		await page.locator('#second-step-phone').fill('07700 900123');
		await page.locator('#second-step-phone').press('Enter');
		await expect(page.locator('[data-bridge-second-step="second_step"]')).toBeVisible();
		const code = await issuer.lastText('+447700900123');
		await page.locator('#second-step-code').pressSequentially(code);
		// Every digit typed, and nothing sent: the code waits for Enter.
		await page.waitForTimeout(600);
		await expect(page.locator('[data-bridge-second-step="second_step"]')).toBeVisible();
		await page.locator('#second-step-code').press('Enter');
		await expect(page.getByTestId('sign-out')).toBeVisible();
	});

	test('the second step: an impossible number is caught before any code is sent', async ({ page, issuer }) => {
		const email = uniqueEmail('mfa-bad');
		await issuer.addPerson({ email, password: PASSWORD, workspaces: [{ id: 'ws-mfa', name: 'Locked', role: 'OWNER', mfa: true }] });
		await page.goto('/auth/sign-in');
		await page.locator('#login-email').fill(email);
		await page.locator('#login-password').fill(PASSWORD);
		await page.locator('#login-password').press('Enter');
		await expect(page.locator('[data-bridge-second-step="second_step_setup"]')).toBeVisible();
		const posts = heldPosts(page, /\/second-step\/setup$/, 0);
		await page.locator('[data-bridge-phone-country]').click();
		await page.locator('[data-bridge-phone-search]').fill('+44');
		await page.locator('[data-bridge-phone-search]').press('Enter');
		await page.locator('#second-step-phone').fill('0770');
		await page.locator('#second-step-phone').press('Enter');
		await expect(page.locator('[data-bridge-second-step="second_step_setup"] [data-bridge-alert]')).toContainText('does not look right');
		expect(posts).toHaveLength(0);
	});
});
