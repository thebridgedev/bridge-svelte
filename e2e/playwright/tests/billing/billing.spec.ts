import { expect, signIn, test } from '../../support/fixtures';

test.describe('billing', () => {
	test('a paid plan goes through checkout and comes back confirmed', async ({ page, person }) => {
		// Stripe's checkout, as the local issuer names it: answer by sending the browser back as Stripe would.
		await page.route('https://checkout.bridge.test/**', (route) => {
			const session = new URL(route.request().url()).pathname.slice(1);
			return route.fulfill({ status: 302, headers: { location: `http://localhost:3001/subscription?stripe_success=1&session_id=${session}` } });
		});
		await signIn(page, person.email);
		await page.goto('/subscription');
		const cards = page.locator('[data-bridge-plan-card]');
		await expect(cards).toHaveCount(2);
		await expect(page.locator('[data-bridge-plan-card][data-plan="free"]')).toHaveAttribute('data-current', 'true');

		await page.locator('[data-bridge-plan-card][data-plan="pro"] .bridge-plan-select-btn').click();
		const confirm = page.locator('[data-bridge-plan-confirm-btn]');
		if (await confirm.isVisible().catch(() => false)) await confirm.click();

		await expect(page).toHaveURL(/\/subscription$/);
		await expect(page.locator('[data-bridge-checkout-notice]')).toContainText('Pro');
		await expect(page.locator('[data-bridge-plan-card][data-plan="pro"]')).toHaveAttribute('data-current', 'true');
		await expect(page.locator('[data-bridge-subscription-status]').first()).toContainText('Pro');
	});

	test('only a person the billing flag allows may change the plan or open the portal', async ({ page, issuer, person }) => {
		await issuer.setFlags({ 'bridge-billing-manage': false });
		await signIn(page, person.email);
		await page.goto('/subscription');
		await expect(page.locator('[data-bridge-plan-card][data-plan="pro"] .bridge-plan-select-btn')).toBeDisabled();
		await expect(page.locator('[data-bridge-billing-portal]')).toHaveCount(0);
	});

	test('the portal button opens the billing portal', async ({ page, person }) => {
		await page.route('https://portal.bridge.test/**', (route) => route.fulfill({ status: 200, body: 'portal' }));
		await signIn(page, person.email);
		await page.goto('/subscription');
		await page.locator('[data-bridge-billing-portal]').click();
		await page.waitForURL('https://portal.bridge.test/**');
	});

	test('a trial about to end shows a notice', async ({ page, issuer, person }) => {
		const inTwoDays = new Date(Date.now() + 2 * 86_400_000).toISOString();
		await issuer.setFacts({ status: 'trialing', trialEnd: inTwoDays, plan: { key: 'pro', name: 'Pro' } });
		await signIn(page, person.email);
		await expect(page.locator('[data-bridge-billing-notice]')).toBeVisible();
	});
});
