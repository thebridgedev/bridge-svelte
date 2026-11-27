import { expect, test } from '../../support/fixtures';

/** The email typed on sign-in carries to Forgot password, never in the address (TBP-92). */
test.describe('the email typed on sign-in carries to Forgot password', () => {
	test('it is there, can be changed, never in the address, and the reset finishes', async ({ page, issuer, person }) => {
		await page.goto('/auth/sign-in');
		await page.locator('#login-email').fill(person.email);
		await page.locator('[data-bridge-forgot-link]').click();
		await expect(page).toHaveURL(/\/auth\/forgot-password$/);
		await expect(page.locator('#forgot-email')).toHaveValue(person.email);
		expect(page.url()).not.toContain(encodeURIComponent(person.email));
		expect(page.url()).not.toContain(person.email);
		await page.locator('[data-bridge-forgot-password="form"] button[type="submit"]').click();
		await expect(page.locator('[data-bridge-forgot-password="sent"]')).toBeVisible();
		const token = await issuer.lastLink(person.email, 'reset-password');
		await page.goto(`/auth#bridge=reset-password&token=${token}`);
		await page.locator('#set-password').fill('a brand new passphrase');
		await page.locator('#set-password-confirm').fill('a brand new passphrase');
		await page.locator('[data-bridge-set-password="form"] button[type="submit"]').click();
		await expect(page.locator('[data-bridge-set-password="done"]')).toBeVisible();
		await page.goto('/auth/sign-in');
		await page.locator('#login-email').fill(person.email);
		await page.locator('#login-password').fill('a brand new passphrase');
		await page.locator('#login-password').press('Enter');
		await expect(page.getByTestId('home-signed-in')).toContainText(person.email);
	});

	test('the carried email can be changed before sending', async ({ page }) => {
		await page.goto('/auth/sign-in');
		await page.locator('#login-email').fill('first@demo.test');
		await page.locator('[data-bridge-forgot-link]').click();
		await expect(page.locator('#forgot-email')).toHaveValue('first@demo.test');
		await page.locator('#forgot-email').fill('second@demo.test');
		await page.locator('[data-bridge-forgot-password="form"] button[type="submit"]').click();
		await expect(page.locator('[data-bridge-forgot-password="sent"]')).toBeVisible();
	});

	test('opened directly, the field is empty', async ({ page }) => {
		await page.goto('/auth/forgot-password');
		await expect(page.locator('#forgot-email')).toHaveValue('');
	});
});
