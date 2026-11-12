import { expect, test } from '../support/fixtures';
import { addVirtualAuthenticator, openHostedSignIn, stageApp } from '../support/hosted';

// H05 on stage: a passkey is made through the emailed set-up link, then used to sign in, with a Chromium virtual authenticator.
test.describe('hosted passkey', () => {
	test('set up from the emailed link, then sign in with it from a clean browser', async ({ page, context, browser, issuer, person }) => {
		const device = await addVirtualAuthenticator(context, page);
		await openHostedSignIn(page);
		await page.locator('#login-email').fill(person.email);
		const setup = page.locator('[data-bridge-passkey-setup-link]');
		await expect(setup, 'the app offers passkeys').toBeVisible();
		await setup.click();
		const token = await issuer.lastLink(person.email, 'passkey-setup');

		// The same tab, so the virtual authenticator holds the passkey made here.
		await page.goto(`${stageApp().app.hostedSignIn}#bridge=passkey-setup&token=${token}`);
		await page.locator('[data-bridge-passkey-create]').click();
		// The set-up signs the person in, on Bridge's page or back in the demo.
		await expect(page.locator('[data-sign-in-state="signed-in"], [data-testid="home-signed-in"]').first()).toContainText(person.email);
		const credentials = await device.credentials();
		expect(credentials).toHaveLength(1);

		// A clean browser with the same passkey on its device: no session anywhere, only the passkey.
		const clean = await browser.newContext();
		const tab = await clean.newPage();
		await (await addVirtualAuthenticator(clean, tab)).load(credentials);
		await tab.goto('/auth/sign-in');
		// The page offers the passkey in the email field's list and as a button; either signs in, and the virtual device picks it at once.
		await Promise.race([tab.locator('[data-bridge-passkey-sign-in]').click({ timeout: 25_000 }).catch(() => undefined), tab.getByTestId('home-signed-in').waitFor({ timeout: 25_000 }).catch(() => undefined)]);
		await expect(tab.getByTestId('home-signed-in')).toContainText(person.email);
		await clean.close();
	});
});
