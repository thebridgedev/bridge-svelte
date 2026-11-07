import { expect, PASSWORD, signIn, test } from '../../support/fixtures';

test.describe('sign-in', () => {
	test('a person with one workspace signs in and lands home', async ({ page, person }) => {
		await signIn(page, person.email);
		await expect(page.getByTestId('home-signed-in')).toContainText(person.email);
		await expect(page.getByTestId('nav-workspace')).toHaveText('Acme');
	});

	test('a wrong password says so, without saying whether the address has an account', async ({ page, person }) => {
		await signIn(page, person.email, 'not the password', undefined, { wait: false });
		await expect(page.locator('[data-bridge-alert][data-variant="error"]')).toHaveText('Invalid email or password.');
		await signIn(page, 'nobody@demo.test', PASSWORD, undefined, { wait: false });
		await expect(page.locator('[data-bridge-alert][data-variant="error"]')).toHaveText('Invalid email or password.');
	});

	test('the sign-up link follows the app’s sign-in options', async ({ page }) => {
		await page.goto('/auth/sign-in');
		await expect(page.locator('a[href="/auth/sign-up"]')).toBeVisible();
		await expect(page.locator('a[href="/auth/forgot-password"]')).toBeVisible();
	});
});
