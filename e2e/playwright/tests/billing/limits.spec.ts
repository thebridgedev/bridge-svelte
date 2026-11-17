import { expect, signIn, test } from '../../support/fixtures';

test.describe('plan limits and plan features', () => {
	test.beforeEach(({ issuer }) => {
		test.skip(issuer.kind === 'real', 'The quota read is the plan\'s own on a real server: the local issuer sets the numbers.');
	});

	test('a metric at its hard limit shows the banner and disables the action, and room left does neither', async ({ page, issuer, person }) => {
		await signIn(page, person.email);
		await page.goto('/tickets');
		await expect(page.getByRole('heading', { name: 'Tickets' })).toBeVisible();
		await expect(page.locator('[data-bridge-quota-banner]')).toHaveCount(0);
		await expect(page.getByTestId('new-ticket')).toBeEnabled();

		await issuer.setQuota('tickets', { used: 3, limit: 3, remaining: 0, policy: 'hard' });
		await page.reload();
		await expect(page.locator('[data-bridge-quota-banner]')).toHaveAttribute('data-state', 'reached');
		await expect(page.locator('[data-bridge-quota-gate]')).toHaveAttribute('data-state', 'at-limit');
		await expect(page.getByTestId('new-ticket')).toBeDisabled();
		await expect(page.locator('[data-bridge-quota-gate-limit] a')).toHaveAttribute('href', '/subscription');
	});

	test('a plan feature that is on shows its content, one that is off shows the fallback', async ({ page, issuer, person }) => {
		await issuer.setFlags({ 'bridge:billing.entitlement.reports': false });
		await signIn(page, person.email);
		await page.goto('/tickets');
		await expect(page.getByTestId('reports-not-entitled')).toBeVisible();
		await issuer.setFlags({ 'bridge:billing.entitlement.reports': true });
		await page.reload();
		await expect(page.getByTestId('reports-entitled')).toBeVisible();
	});

	test('a workspace locked for payment shows the lock', async ({ page, issuer, person }) => {
		await issuer.setFacts({ status: 'past_due', access: 'blocked', locked: true });
		await signIn(page, person.email);
		await expect(page.locator('[data-bridge-billing-notice][data-kind="blocked"]')).toBeVisible();
	});
});
