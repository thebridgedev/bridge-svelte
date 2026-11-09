import { expect, signIn, test } from '../../support/fixtures';

test.describe('flag components', () => {
	test('a feature off because of the plan offers an upgrade, and the dialog explains it', async ({ page, issuer, person }) => {
		await issuer.setFlags({ 'pdf-export': { value: false, reason: 'TARGETING_MATCH', metadata: { why: 'plan feature missing', entitlement: 'pdf-export' } } });
		await signIn(page, person.email);
		await page.goto('/tickets');
		await expect(page.getByTestId('pdf-export')).toHaveCount(0);
		await page.locator('[data-bridge-feature-upgrade="pdf-export"]').click();
		const dialog = page.locator('[data-bridge-upgrade-dialog]');
		await expect(dialog).toHaveAttribute('data-variant', 'feature');
		await expect(dialog.locator('[data-bridge-upgrade-dialog-cta]')).toHaveAttribute('href', '/subscription/plan');
	});

	test('a feature off for any other reason shows nothing', async ({ page, issuer, person }) => {
		await issuer.setFlags({ 'pdf-export': false });
		await signIn(page, person.email);
		await page.goto('/tickets');
		await expect(page.getByRole('heading', { name: 'Tickets' })).toBeVisible();
		await expect(page.locator('[data-bridge-feature-upgrade]')).toHaveCount(0);
		await expect(page.getByTestId('pdf-export')).toHaveCount(0);
	});

	test('a feature that is on renders its children', async ({ page, issuer, person }) => {
		await issuer.setFlags({ 'pdf-export': true });
		await signIn(page, person.email);
		await page.goto('/tickets');
		await expect(page.getByTestId('pdf-export')).toBeVisible();
	});

	test('a 402 from the app’s own API opens the upgrade dialog with the numbers', async ({ page, issuer, person }) => {
		if (issuer.kind === 'local') {
			// The local issuer's tokens are not signed, so the demo's server would refuse the call before its route
			// runs; answer as the route does. The browser's side is what this test is about.
			await page.route('**/api/exports', (route) =>
				route.fulfill({ status: 402, json: { code: 'QUOTA_EXCEEDED', message: 'Your plan allows 10 exports this month.', metric: 'exports', used: 10, limit: 10, fix: '/subscription' } }),
			);
		}
		await signIn(page, person.email);
		await page.goto('/tickets');
		await page.getByTestId('export').click();
		const dialog = page.locator('[data-bridge-upgrade-dialog]');
		await expect(dialog).toHaveAttribute('data-variant', 'limit');
		await expect(dialog).toHaveAttribute('data-metric', 'exports');
		await expect(dialog.locator('[data-bridge-upgrade-dialog-message]')).toContainText('10');
	});
});
