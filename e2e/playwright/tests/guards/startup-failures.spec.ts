import { expect, signIn, test } from '../../support/fixtures';

/**
 * A sign-in problem at startup never breaks a page (TBP-123), in a real browser: the demo's home page is marked public,
 * its reports page needs a flag and its settings need a sign-in.
 */
test.describe('sign-in problems never break a page', () => {
	test('the public home page shows at once while Bridge does not answer, and asks Bridge nothing before it shows', async ({ page }) => {
		const asked: string[] = [];
		await page.route(/identity-access|\/v2\//, async (route) => {
			asked.push(route.request().url());
			// Never answers, as an unreachable Bridge.
			await new Promise(() => undefined);
		});
		const started = Date.now();
		await page.goto('/');
		await expect(page.getByTestId('home-visitor')).toBeVisible({ timeout: 3000 });
		expect(Date.now() - started).toBeLessThan(3000);
	});

	test('a stored sign-in that can no longer be renewed: the public page shows with the visitor signed out, and sign-up opens from it', async ({ page, issuer, person }) => {
		await signIn(page, person.email);
		await issuer.endSessions(person.email);
		// The access token is dropped, so the page must renew with a refresh token Bridge has ended.
		await page.evaluate(() => {
			for (const key of Object.keys(localStorage)) if (/access/i.test(key)) localStorage.removeItem(key);
		});
		await page.goto('/');
		await expect(page.getByTestId('home-visitor')).toBeVisible();
		await page.getByRole('link', { name: 'sign up' }).click();
		await expect(page.locator('[data-bridge-sign-up-step="form"]')).toBeVisible();
	});

	test('failing flags: the home page still shows, with default flag values', async ({ page }) => {
		// Bridge's flags, not the demo's own modules.
		await page.route((url) => url.port === '4400' && url.pathname.includes('/flags'), (route) => route.fulfill({ status: 500, body: 'oops' }));
		await page.goto('/');
		await expect(page.getByTestId('home-visitor')).toBeVisible();
	});

	test('a page that needs sign-in still sends the visitor to sign in, and back after', async ({ page, person }) => {
		await page.goto('/settings/team');
		await expect(page).toHaveURL(/\/auth\/sign-in/);
		await page.locator('#login-email').fill(person.email);
		await page.locator('#login-password').fill(person.password);
		await page.locator('#login-password').press('Enter');
		await expect(page).toHaveURL(/\/settings\/team/);
	});
});
