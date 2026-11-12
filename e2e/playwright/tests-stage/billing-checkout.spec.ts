import { expect, test } from '../support/fixtures';
import { hostedSignIn, stageApp } from '../support/hosted';

// J02 on stage: a paid plan is bought through Stripe's test checkout (test mode only, Stripe's test card), and the features it holds unlock.
test.describe('plan checkout', () => {
	test('the plan picker goes to Stripe, the test card pays, and the plan’s feature unlocks', async ({ page, issuer, person }) => {
		const { stripe, plans } = stageApp();
		test.skip(!stripe.connected, `The app has no Stripe test account: ${stripe.skipped ?? 'not connected'}.`);
		const paid = plans.find((plan) => plan.paid && plan.trialDays === null);
		test.skip(paid === undefined, 'The app has no paid plan without a trial.');
		const feature = paid!.features.find((key) => key.endsWith('export')) ?? paid!.features[0]!;

		await issuer.setFlags({ 'pdf-export': { value: false, metadata: { entitlement: feature } } });
		await hostedSignIn(page, person.email, person.password);
		await page.goto('/tickets');
		await expect(page.getByTestId('pdf-export')).toHaveCount(0);

		await page.goto('/subscription');
		await page.locator(`[data-bridge-plan-card][data-plan="${paid!.key}"] .bridge-plan-select-btn`).click();
		const confirm = page.locator('[data-bridge-plan-confirm-btn]');
		if (await confirm.isVisible().catch(() => false)) await confirm.click();

		await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
		// Stripe's hosted page, in test mode: the test card, any future date and security code.
		await page.locator('#cardNumber').fill('4242424242424242');
		await page.locator('#cardExpiry').fill('12 / 34');
		await page.locator('#cardCvc').fill('123');
		const name = page.locator('#billingName');
		if (await name.isVisible().catch(() => false)) await name.fill('Parity Test');
		const postal = page.locator('#billingPostalCode');
		if (await postal.isVisible().catch(() => false)) await postal.fill('11122');
		await page.locator('button[type="submit"]').first().click();

		await page.waitForURL((url) => url.origin === new URL(page.url()).origin && !url.hostname.includes('stripe'), { timeout: 120_000 });
		await expect(page.locator('[data-bridge-plan-card][data-current="true"]')).toHaveAttribute('data-plan', paid!.key);
		await page.goto('/tickets');
		await expect(page.getByTestId('pdf-export')).toBeVisible();
	});
});
