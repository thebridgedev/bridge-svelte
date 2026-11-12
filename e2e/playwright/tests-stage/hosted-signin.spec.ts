import { expect, PASSWORD, test } from '../support/fixtures';
import { fillCredentials, hostedSignIn, onHostedPage, openHostedSignIn, stageApp } from '../support/hosted';

// H01, H06, H11, S01 on stage: the demo hands the person to the page Bridge hosts for the app, which signs them in and sends them back.
test.describe('hosted sign-in', () => {
	test('password sign-in on the hosted page lands back in the demo, signed in', async ({ page, person }) => {
		await hostedSignIn(page, person.email, person.password);
		await expect(page.getByTestId('home-signed-in')).toContainText(person.email);
		await expect(page.getByTestId('nav-workspace')).toHaveText('Acme');
		expect(new URL(page.url()).pathname).not.toContain('/callback');
	});

	test('a wrong password says so on the hosted page, without saying whether the address has an account', async ({ page, person }) => {
		await openHostedSignIn(page);
		await fillCredentials(page, person.email, 'not the password');
		await expect(page.locator('[data-bridge-alert][data-variant="error"]')).toHaveText('Invalid email or password.');
		await fillCredentials(page, 'nobody@example.test', PASSWORD);
		await expect(page.locator('[data-bridge-alert][data-variant="error"]')).toHaveText('Invalid email or password.');
	});

	test('the hosted page is drawn in the app’s own colours', async ({ page }) => {
		await openHostedSignIn(page);
		const primary = stageApp().branding.colors['primary'];
		expect(primary, 'the fixture sets a primary colour').toBeTruthy();
		const [r, g, b] = [1, 3, 5].map((at) => parseInt(primary!.slice(at, at + 2), 16));
		const button = page.locator('[data-bridge-sign-in-step="credentials"] button[type="submit"]');
		// The button is disabled until the form is filled; a disabled button keeps its colour.
		await expect(button).toHaveCSS('background-color', `rgb(${r}, ${g}, ${b})`);
	});

	test('in Swedish for a browser that asks for it, and the sign-in still lands back in the demo', async ({ browser, person }) => {
		const stageSv = stageApp().languages.enabled.includes('sv');
		test.skip(!stageSv, 'The app does not offer Swedish.');
		const context = await browser.newContext({ locale: 'sv-SE' });
		const page = await context.newPage();
		await openHostedSignIn(page);
		await expect(page.locator('[data-bridge-sign-in-step="credentials"] button[type="submit"]')).toHaveText('Logga in');
		await expect(page.locator('#login-email')).toBeVisible();
		await fillCredentials(page, person.email, 'fel lösenord');
		await expect(page.locator('[data-bridge-alert][data-variant="error"]')).toHaveText('Fel e-postadress eller lösenord.');
		await fillCredentials(page, person.email, person.password);
		await expect(page.getByTestId('home-signed-in')).toContainText(person.email);
		await context.close();
	});

	test('signing out leaves the protected pages behind, and signing in again returns to the page asked for', async ({ page, person }) => {
		await hostedSignIn(page, person.email, person.password);
		await page.getByTestId('sign-out').click();
		await expect(page.getByTestId('sign-out')).toHaveCount(0);
		await page.goto('/tickets');
		await onHostedPage(page);
		await fillCredentials(page, person.email, person.password);
		await expect(page).toHaveURL(/\/tickets$/);
		await expect(page.getByRole('heading', { name: 'Tickets' })).toBeVisible();
	});
});
