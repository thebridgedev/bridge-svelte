import { expect, test } from '../support/fixtures';
import { openHostedSignIn, signedInOn, stageApp } from '../support/hosted';

// H04 on stage: a sign-in link opens only in the browser that asked for it.
test.describe('hosted magic link', () => {
	test('the link finishes the sign-in in the browser that asked, and lands back in the demo; another browser is refused', async ({ page, browser, issuer, person }) => {
		await openHostedSignIn(page);
		await page.locator('#login-email').fill(person.email);
		await page.locator('[data-bridge-magic-link-send]').first().click();
		await expect(page.locator('[data-bridge-alert]')).toBeVisible();
		const token = await issuer.lastLink(person.email, 'magic-link');
		const hosted = stageApp().app.hostedSignIn;

		const scanner = await browser.newContext();
		const scanned = await scanner.newPage();
		await scanned.goto(`${hosted}#bridge=magic-link&token=${token}`);
		await expect(scanned.locator('[data-bridge-magic-link="failed"]')).toHaveAttribute('data-error-kind', 'wrong-device');
		await scanner.close();

		const here = await page.context().newPage();
		await here.goto(`${hosted}#bridge=magic-link&token=${token}`);
		await signedInOn([here, page], person.email);
	});
});
