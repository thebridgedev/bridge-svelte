import { expect, signIn, test } from '../../support/fixtures';

test.describe('sign-out and sessions', () => {
	test('signing out leaves the protected pages behind', async ({ page, person }) => {
		await signIn(page, person.email);
		await expect(page.getByTestId('home-signed-in')).toBeVisible();
		await page.getByTestId('sign-out').click();
		await expect(page).toHaveURL(/\/auth\/sign-in$/);
		await page.goto('/tickets');
		await expect(page).toHaveURL(/\/auth\/sign-in\?redirectUri=%2Ftickets$/);
	});

	test('a deep link survives the trip through sign-in', async ({ page, person }) => {
		await page.goto('/settings/team');
		await expect(page).toHaveURL(/redirectUri=%2Fsettings%2Fteam/);
		await page.locator('#login-email').fill(person.email);
		await page.locator('#login-password').fill(person.password);
		await page.locator('[data-bridge-sign-in-step="credentials"] button[type="submit"]').click();
		await expect(page).toHaveURL(/\/settings\/team$/);
	});

	test('a session Bridge ended sends the person to sign in again, saying why', async ({ page, issuer, person }) => {
		await signIn(page, person.email);
		await expect(page.getByTestId('home-signed-in')).toBeVisible();
		await issuer.endSessions(person.email);
		await page.goto('/tickets');
		await expect(page).toHaveURL(/\/auth\/sign-in/);
		await expect(page.locator('[data-bridge-alert][data-variant="info"]')).toHaveText('Your session ended. Please sign in again.');
	});

	test('two tabs share one session', async ({ page, context, person }) => {
		await signIn(page, person.email);
		await expect(page.getByTestId('home-signed-in')).toBeVisible();
		const second = await context.newPage();
		await second.goto('/tickets');
		await expect(second.getByRole('heading', { name: 'Tickets' })).toBeVisible();
		await page.getByTestId('sign-out').click();
		await expect(second).toHaveURL(/\/auth\/sign-in/);
	});
});
