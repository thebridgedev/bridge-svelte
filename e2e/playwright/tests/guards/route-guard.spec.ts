import { expect, signIn, test } from '../../support/fixtures';

test.describe('route guard', () => {
	test('a visitor sees public pages and is sent to sign-in from protected ones', async ({ page, issuer }) => {
		await issuer.reset();
		await page.goto('/');
		await expect(page.getByTestId('home-visitor')).toBeVisible();
		await page.goto('/subscription');
		await expect(page).toHaveURL(/\/auth\/sign-in\?redirectUri=%2Fsubscription$/);
	});

	test('a page behind a flag opens only while the flag is on', async ({ page, issuer, person }) => {
		await issuer.setFlags({ reports: false });
		await signIn(page, person.email);
		await expect(page.getByTestId('home-signed-in')).toBeVisible();
		await expect(page.getByTestId('nav-reports')).toHaveCount(0);
		await page.goto('/reports');
		await expect(page).toHaveURL(/\/$/);

		await issuer.setFlags({ reports: true });
		await page.goto('/reports');
		await expect(page.getByTestId('reports-page')).toBeVisible();
		await expect(page.getByTestId('nav-reports')).toBeVisible();
	});

	test('while the app is not active for the workspace, the plan page is the way in', async ({ page, issuer, person }) => {
		await issuer.setFlags({ 'bridge-app-active': false });
		await signIn(page, person.email);
		await page.goto('/tickets');
		await expect(page).toHaveURL(/\/subscription\/plan\?redirectUri=%2Ftickets$/);
		await page.goto('/');
		await expect(page.getByTestId('home-signed-in')).toBeVisible();
	});
});
