import { expect, signIn, test } from '../../support/fixtures';

// What a payer sees while a plan change is on its way, and where checkout sends them back to. The local issuer answers
// the way Bridge does: a downgrade waits for the period's end, an upgrade waits for its payment.
const ORIGIN = 'http://localhost:3001';
const PERIOD_END = '2026-12-24T00:00:00.000Z';
const PLANS = [
	{ key: 'free', name: 'Free', description: null, archived: false, free: true, prices: [], features: ['tickets'], limits: {}, trial: null },
	{ key: 'pro', name: 'Pro', description: null, archived: false, free: false, prices: [{ currency: 'usd', interval: 'month', amount: 2900 }], features: ['reports'], limits: {}, trial: null },
	{ key: 'mega', name: 'Mega', description: null, archived: false, free: false, prices: [{ currency: 'usd', interval: 'month', amount: 9900 }], features: ['reports', 'sso'], limits: {}, trial: null },
];

async function control(path: string, body: unknown): Promise<void> {
	const response = await fetch(`${process.env.E2E_FAKE_CONTROL}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
	if (!response.ok) throw new Error(`${path}: ${response.status}`);
}

test.describe('plan changes', () => {
	test.skip(({ issuer }) => issuer.kind === 'real', 'The payment provider decides these on a real server: tests-stage.');

	test.beforeEach(async ({ issuer }) => {
		void issuer;
		await control('/plans', { plans: PLANS });
	});

	test('checkout is sent the subscription page as the way back, comes back to it, and the old success page goes on to it', async ({ page, issuer, person }) => {
		await issuer.requireCheckoutReturnOn([ORIGIN]);
		await page.route('https://checkout.bridge.test/**', (route) => {
			const session = new URL(route.request().url()).pathname.slice(1);
			// Where the app's own return address leads; an earlier version's success page carried the same details.
			return route.fulfill({ status: 302, headers: { location: `${ORIGIN}/subscription/success?stripe_success=1&session_id=${session}` } });
		});
		await signIn(page, person.email);
		await page.goto('/subscription');
		await page.locator('[data-bridge-plan-card][data-plan="pro"] .bridge-plan-select-btn').click();
		const confirm = page.locator('[data-bridge-plan-confirm-btn]');
		if (await confirm.isVisible().catch(() => false)) await confirm.click();
		await expect(page).toHaveURL(/\/subscription(\?|$)/);
		await expect(page.locator('[data-bridge-checkout-notice]')).toContainText("You're on Pro now");
		await expect(page.locator('[data-bridge-billing-summary]')).toContainText('Pro');
		expect((await issuer.billingCalls()).planChoices).toEqual([{ plan: 'pro', returnUrl: `${ORIGIN}/subscription` }]);
	});

	test('an app whose address is not registered gets a plain message on the page and the exact fix in the console', async ({ page, issuer, person }) => {
		await issuer.requireCheckoutReturnOn(['https://some-other-app.test']);
		const logged: string[] = [];
		page.on('console', (message) => message.type() === 'error' && logged.push(message.text()));
		await signIn(page, person.email);
		await page.goto('/subscription');
		await page.locator('[data-bridge-plan-card][data-plan="pro"] .bridge-plan-select-btn').click();
		const confirm = page.locator('[data-bridge-plan-confirm-btn]');
		if (await confirm.isVisible().catch(() => false)) await confirm.click();
		const alert = page.locator('[data-bridge-alert]');
		await expect(alert).toContainText('Changing the plan is not available right now.');
		await expect(page.locator('body')).not.toContainText('return-url-not-registered');
		expect(logged.join('\n')).toMatch(/\[bridge\] The checkout could not start\. return-url-not-registered: http:\/\/localhost:3001 is not one of the app's registered browser origins/);
	});

	test('a downgrade says it in the current-plan box until the period ends, and Keep Pro takes it back', async ({ page, issuer, person }) => {
		await issuer.setFacts({ plan: { key: 'pro', name: 'Pro' }, status: 'active', access: 'ok', periodEnd: PERIOD_END, waiting: null });
		await signIn(page, person.email);
		await page.goto('/subscription');
		const box = page.locator('[data-bridge-billing-summary]');
		await expect(box).toContainText('Renews');
		await page.locator('[data-bridge-plan-card][data-plan="free"] .bridge-plan-select-btn').click();
		const confirm = page.locator('[data-bridge-plan-confirm-btn]');
		if (await confirm.isVisible().catch(() => false)) await confirm.click();
		await expect(box.locator('[data-bridge-billing-scheduled]')).toContainText(/Pro until .*2026, then Free/);
		await expect(box).not.toContainText('Renews');
		await expect(page.locator('[data-bridge-plan-card][data-plan="free"] [data-bridge-plan-scheduled-flag]')).toContainText('Starts');
		// It does not go away on its own: the page still says so after a reload.
		await page.reload();
		await expect(box.locator('[data-bridge-billing-scheduled]')).toBeVisible();
		await box.locator('[data-bridge-billing-keep]').click();
		await expect(box.locator('[data-bridge-billing-scheduled]')).toHaveCount(0);
		await expect(box).toContainText('Renews');
		await expect(page.locator('[data-bridge-plan-scheduled-flag]')).toHaveCount(0);
	});

	test('an upgrade shows it is being confirmed, with no message that goes away, then says the person is on the new plan', async ({ page, issuer, person }) => {
		await issuer.setFacts({ plan: { key: 'pro', name: 'Pro' }, status: 'active', access: 'ok', periodEnd: PERIOD_END, waiting: null });
		await signIn(page, person.email);
		await page.goto('/subscription');
		await page.locator('[data-bridge-plan-card][data-plan="mega"] .bridge-plan-select-btn').click();
		const confirm = page.locator('[data-bridge-plan-confirm-btn]');
		if (await confirm.isVisible().catch(() => false)) await confirm.click();
		const upgrade = page.locator('[data-bridge-billing-upgrade]');
		await expect(upgrade).toContainText('Upgrading to Mega');
		await expect(upgrade).toHaveAttribute('data-state', 'confirming');
		await expect(page.locator('[data-bridge-plan-success]')).toHaveCount(0);
		await expect(page.locator('[data-bridge-plan-card][data-plan="mega"] .bridge-plan-select-btn')).toHaveText('Upgrading…');
		await issuer.settlePayment();
		// Read again from Bridge every few seconds while the payment is awaited.
		await expect(upgrade).toContainText("You're on Mega now", { timeout: 15_000 });
		await expect(upgrade).toHaveAttribute('data-state', 'done');
		await expect(page.locator('[data-bridge-billing-summary]')).toContainText('Mega');
	});

	test('a payment that fails says so plainly, with one button to update the card', async ({ page, issuer, person }) => {
		await issuer.setFacts({ plan: { key: 'pro', name: 'Pro' }, status: 'active', access: 'ok', periodEnd: PERIOD_END, waiting: null });
		await signIn(page, person.email);
		await page.goto('/subscription');
		await page.locator('[data-bridge-plan-card][data-plan="mega"] .bridge-plan-select-btn').click();
		const confirm = page.locator('[data-bridge-plan-confirm-btn]');
		if (await confirm.isVisible().catch(() => false)) await confirm.click();
		await expect(page.locator('[data-bridge-billing-upgrade]')).toHaveAttribute('data-state', 'confirming');
		await issuer.failPayment();
		const upgrade = page.locator('[data-bridge-billing-upgrade]');
		await expect(upgrade).toHaveAttribute('data-state', 'failed', { timeout: 15_000 });
		await expect(upgrade).toContainText('did not go through');
		await expect(upgrade.getByRole('button', { name: 'Update card' })).toBeVisible();
	});

	test('the billing pages have a Back link to the app', async ({ page, person }) => {
		await signIn(page, person.email);
		await page.goto('/subscription');
		const back = page.locator('[data-bridge-billing-back]');
		await expect(back).toHaveAttribute('href', '/');
		await back.click();
		await expect(page).toHaveURL(`${ORIGIN}/`);
	});
});
