import { expect, PASSWORD, signIn, test } from '../../support/fixtures';

/**
 * TBP-85 on the app's own sign-in screens: a password from a public leak. On Warn the sign-in succeeds and the person is
 * offered to change it before going on, even though the session already exists and the app's route guard would move a
 * signed-in person on from the sign-in page. On Refuse there is no session; a new password is the way on.
 */
test.describe('a password from a public leak (TBP-85)', () => {
	test('on Warn, the change offer shows on the app’s own sign-in page and stays until the person goes on', async ({ page, person, issuer }) => {
		test.skip(issuer.leakPasswords === undefined, 'Only the local issuer marks passwords as leaked.');
		await issuer.leakPasswords?.([PASSWORD], 'warn');
		await signIn(page, person.email, PASSWORD, undefined, { wait: false });
		const step = page.locator('[data-bridge-sign-in-step="leaked-password"]');
		await expect(step).toBeVisible();
		await expect(step).toHaveAttribute('data-leaked-mode', 'warn');
		// Signed in by now, yet still on the sign-in page with the offer: the route guard does not move on first.
		await page.waitForTimeout(1_500);
		await expect(step).toBeVisible();
		await expect(page).toHaveURL(/\/auth\/sign-in/);
		await page.locator('[data-bridge-leaked-not-now]').click();
		await expect(page.getByTestId('home-signed-in')).toContainText(person.email);
	});

	test('on Refuse, the person is not signed in and must set a new password', async ({ page, person, issuer }) => {
		test.skip(issuer.leakPasswords === undefined, 'Only the local issuer marks passwords as leaked.');
		await issuer.leakPasswords?.([PASSWORD], 'refuse');
		await signIn(page, person.email, PASSWORD, undefined, { wait: false });
		const step = page.locator('[data-bridge-sign-in-step="leaked-password"]');
		await expect(step).toBeVisible();
		await expect(step).toHaveAttribute('data-leaked-mode', 'refuse');
		await expect(page.locator('[data-bridge-leaked-not-now]')).toHaveCount(0);
		await expect(page.getByTestId('home-signed-in')).toHaveCount(0);
	});
});
