import { expect, test } from '../support/fixtures';
import { fillCredentials, hostedSignIn, openHostedSignIn, stageApp } from '../support/hosted';

const NEW_PASSWORD = 'a brand new passphrase 7';

// H10 on stage: forgot password on the hosted page, the email, a new password, then signed in at the demo.
test.describe('hosted password recovery', () => {
	test('a reset link sets a new password, which then signs in', async ({ page, context, issuer, person }) => {
		await openHostedSignIn(page);
		await page.locator('[data-bridge-sign-in-step="credentials"]').getByRole('link', { name: /forgot/i }).click();
		await page.locator('#forgot-email').fill(person.email);
		await page.locator('[data-bridge-forgot-password="form"] button[type="submit"]').click();
		await expect(page.locator('[data-bridge-forgot-password="sent"]')).toBeVisible();

		const token = await issuer.lastLink(person.email, 'reset-password');
		const opened = await context.newPage();
		await opened.goto(`${stageApp().app.hostedSignIn}#bridge=reset-password&token=${token}`);
		await opened.locator('#set-password').fill(NEW_PASSWORD);
		await opened.locator('#set-password-confirm').fill(NEW_PASSWORD);
		await opened.locator('[data-bridge-set-password="form"] button[type="submit"]').click();
		await expect(opened.locator('[data-bridge-set-password="done"]')).toBeVisible();

		await opened.close();
		await page.goto('/');
		await hostedSignIn(page, person.email, NEW_PASSWORD);
		await expect(page.getByTestId('home-signed-in')).toContainText(person.email);
	});

	test('an unknown address gets the same answer', async ({ page }) => {
		await openHostedSignIn(page);
		await page.locator('[data-bridge-sign-in-step="credentials"]').getByRole('link', { name: /forgot/i }).click();
		await page.locator('#forgot-email').fill('nobody@example.test');
		await page.locator('[data-bridge-forgot-password="form"] button[type="submit"]').click();
		await expect(page.locator('[data-bridge-forgot-password="sent"]')).toBeVisible();
		void fillCredentials;
	});
});
