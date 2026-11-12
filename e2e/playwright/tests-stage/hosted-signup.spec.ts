import { expect, PASSWORD, test, uniqueEmail } from '../support/fixtures';
import { openHostedSignIn, signedInOn, stageApp } from '../support/hosted';

async function startSignUp(page: import('@playwright/test').Page, email: string) {
	await openHostedSignIn(page);
	await page.locator('[data-bridge-sign-in-step="credentials"]').getByRole('link', { name: /sign up/i }).click();
	await page.locator('#signup-first-name').fill('Sam');
	await page.locator('#signup-email').fill(email);
	await page.locator('#signup-password').fill(PASSWORD);
	await page.locator('[data-bridge-sign-up-step="form"] button[type="submit"]').click();
	await expect(page.locator('[data-bridge-sign-up-step="sent"]')).toContainText(email);
}

// H02, H03 on stage: sign-up on the hosted page, finished from the email, on the device that started it.
test.describe('hosted sign-up', () => {
	test('the email link finishes sign-up on the device that started it, and the person lands back in the demo', async ({ page, context, issuer }) => {
		const email = uniqueEmail('sam');
		await startSignUp(page, email);
		const token = await issuer.lastLink(email, 'verify-sign-up');
		const hostedPage = stageApp().app.hostedSignIn;
		const opened = await context.newPage();
		await opened.goto(`${hostedPage}#bridge=verify-email&token=${token}`);
		await signedInOn([page, opened], email);
	});

	test('opened on another device, the link says so and stays usable', async ({ page, browser, issuer }) => {
		const email = uniqueEmail('sam');
		await startSignUp(page, email);
		const token = await issuer.lastLink(email, 'verify-sign-up');
		const hostedPage = stageApp().app.hostedSignIn;
		const other = await browser.newContext();
		const elsewhere = await other.newPage();
		await elsewhere.goto(`${hostedPage}#bridge=verify-email&token=${token}`);
		await expect(elsewhere.locator('[data-bridge-verify-email="failed"]')).toHaveAttribute('data-error-kind', 'wrong-device');
		await other.close();
		const here = await page.context().newPage();
		await here.goto(`${hostedPage}#bridge=verify-email&token=${token}`);
		await signedInOn([page, here], email);
	});
});
