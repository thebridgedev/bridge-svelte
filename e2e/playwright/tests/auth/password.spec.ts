import { expect, expectTokenGone, recordRequests, signIn, test } from '../../support/fixtures';

const NEW_PASSWORD = 'a brand new passphrase';

test.describe('password recovery', () => {
	test('a reset link sets a new password, which then signs in', async ({ page, issuer, person }) => {
		await page.goto('/auth/forgot-password');
		await page.locator('#forgot-email').fill(person.email);
		await page.locator('[data-bridge-forgot-password="form"] button[type="submit"]').click();
		await expect(page.locator('[data-bridge-forgot-password="sent"] [data-bridge-alert]')).toHaveText('Check your email for a password reset link.');

		const token = await issuer.lastLink(person.email, 'reset-password');
		const requests = recordRequests(page);
		await page.goto(`/auth#bridge=reset-password&token=${token}`);
		await expect(page).toHaveURL(/\/auth\/set-password$/);
		await expect(page.locator('[data-bridge-set-password="form"]')).toBeVisible();
		expect(page.url()).not.toContain(token);

		await page.locator('#set-password').fill(NEW_PASSWORD);
		await page.locator('#set-password-confirm').fill('something else');
		await page.locator('[data-bridge-set-password="form"] button[type="submit"]').click();
		await expect(page.locator('[data-bridge-alert]')).toHaveText('Passwords do not match.');

		await page.locator('#set-password-confirm').fill(NEW_PASSWORD);
		await page.locator('[data-bridge-set-password="form"] button[type="submit"]').click();
		await expect(page.locator('[data-bridge-set-password="done"]')).toBeVisible();
		await expectTokenGone(page, token, requests);

		await signIn(page, person.email, NEW_PASSWORD);
		await expect(page.getByTestId('home-signed-in')).toContainText(person.email);
	});

	test('an unknown address gets the same answer', async ({ page }) => {
		await page.goto('/auth/forgot-password');
		await page.locator('#forgot-email').fill('nobody@demo.test');
		await page.locator('[data-bridge-forgot-password="form"] button[type="submit"]').click();
		await expect(page.locator('[data-bridge-forgot-password="sent"]')).toBeVisible();
	});
});
