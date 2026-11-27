import { expect, expectTokenGone, PASSWORD, recordRequests, test, uniqueEmail } from '../../support/fixtures';

async function signUp(page: import('@playwright/test').Page, email: string) {
	await page.goto('/auth/sign-up');
	await page.locator('#signup-first-name').fill('Sam');
	await page.locator('#signup-email').fill(email);
	await page.locator('#signup-password').fill(PASSWORD);
	await page.locator('[data-bridge-sign-up-step="form"] button[type="submit"]').click();
	await expect(page.locator('[data-bridge-sign-up-sent]')).toContainText(email);
}

test.describe('sign-up', () => {
	test('the email link finishes sign-up on the device that started it', async ({ page, issuer }) => {
		const email = uniqueEmail('sam');
		await signUp(page, email);
		const token = await issuer.lastLink(email, 'verify-sign-up');
		const requests = recordRequests(page);
		// Bridge's email links land on the app's email-links address with the token in the fragment.
		await page.goto(`/auth#bridge=verify-email&token=${token}`);
		// One button first (TBP-55): nothing is used until it is pressed.
		await page.locator('[data-bridge-link-confirm]').click();
		await expect(page.getByTestId('home-signed-in')).toContainText(email);
		await expectTokenGone(page, token, requests);
	});

	test('opened on another device, the link says so and stays usable', async ({ page, browser, issuer }) => {
		const email = uniqueEmail('sam');
		await signUp(page, email);
		const token = await issuer.lastLink(email, 'verify-sign-up');

		const other = await browser.newContext();
		const elsewhere = await other.newPage();
		await elsewhere.goto(`/auth#bridge=verify-email&token=${token}`);
		// One button first (TBP-55): nothing is used until it is pressed.
		await elsewhere.locator('[data-bridge-link-confirm]').click();
		await expect(elsewhere.locator('[data-bridge-verify-email="failed"]')).toHaveAttribute('data-error-kind', 'wrong-device');
		await expect(elsewhere.locator('[data-bridge-alert]')).toHaveText('This link works only in the browser where you signed up. Open it there, or sign up again here.');
		// The way on from there: signing up again in this browser.
		await expect(elsewhere.locator('[data-bridge-verify-sign-up-again]')).toHaveAttribute('href', '/auth/sign-up');
		await other.close();

		await page.goto(`/auth#bridge=verify-email&token=${token}`);
		// One button first (TBP-55): nothing is used until it is pressed.
		await page.locator('[data-bridge-link-confirm]').click();
		await expect(page.getByTestId('home-signed-in')).toContainText(email);
	});

	test('the link opened in a new tab signs in there, and the tab that started the sign-up goes on signed in too', async ({ page, context, issuer }) => {
		const email = uniqueEmail('sid');
		await signUp(page, email);
		const token = await issuer.lastLink(email, 'verify-sign-up');
		const linkTab = await context.newPage();
		await linkTab.goto(`/auth#bridge=verify-email&token=${token}`);
		// One button first (TBP-55): nothing is used until it is pressed.
		await linkTab.locator('[data-bridge-link-confirm]').click();
		await expect(linkTab.getByTestId('home-signed-in')).toContainText(email);
		await expect(page.getByTestId('home-signed-in')).toContainText(email);
	});

	test('the verify page without a link says where the link is', async ({ page }) => {
		await page.goto('/auth/verify-email');
		await expect(page.locator('[data-bridge-alert]')).toHaveText('Open this page from the link in your email.');
	});
});
