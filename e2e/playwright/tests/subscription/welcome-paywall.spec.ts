/**
 * Welcome Paywall — first-time-user end-to-end flow
 *
 * Covers the full first-time-user paywall flow now that BridgeBootstrap gates
 * the paywall redirect on `getSubscriptionStatus()` (shouldSelectPlan +
 * paymentsAutoRedirect). This test proves a brand-new user is:
 *
 *   1. Forced to /welcome when they try to hit any protected route
 *   2. Able to complete Stripe Checkout from the PlanSelector on /welcome
 *   3. Landed on an in-app (non-paywall) route after returning from Stripe
 *   4. NOT bounced back to /welcome on subsequent navigation to protected routes
 *
 * Requires STRIPE_TEST_PK / STRIPE_TEST_SK env vars (skipped otherwise).
 * The test-data API is used to: create the user, configure the app for
 * Stripe + paymentsAutoRedirect, and create a paid plan. All test resources
 * are cleaned up in afterAll / per-test finally blocks.
 */

import { test, expect, loginViaSdkAuth } from '../../fixtures/auth';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';

const STRIPE_TEST_PK = process.env.STRIPE_TEST_PK || '';
const STRIPE_TEST_SK = process.env.STRIPE_TEST_SK || '';
const hasStripeKeys = !!STRIPE_TEST_PK && !!STRIPE_TEST_SK;

test.describe('Welcome Paywall — first-time user flow', () => {
  test.skip(!hasStripeKeys, 'STRIPE_TEST_PK / STRIPE_TEST_SK env vars required');

  test('signup → protected route bounces to /welcome → pay → land in app', async ({
    page,
    testUser,
    testDataClient,
    envConfig,
  }) => {
    // Stripe Checkout round-trip alone can take 20-40s; the default 60s
    // budget leaves no room for the rest of the flow + final assertions.
    test.setTimeout(120_000);

    const planKey = `paywall-pro-${Date.now()}`;

    try {
      // ---- Arrange: configure the app for Stripe + paywall, and create a paid plan
      await testDataClient.configureApp({
        paymentsAutoRedirect: true,
        stripeEnabled: true,
        stripePublicKey: STRIPE_TEST_PK,
        stripeSecretKey: STRIPE_TEST_SK,
        currency: 'USD',
      });

      await testDataClient.createPlan({
        key: planKey,
        name: 'Paywall Pro',
        description: 'Paid plan for welcome-paywall E2E',
        trial: false,
        trialDays: 0,
        prices: [{ amount: 2900, currency: 'USD', recurrenceInterval: 'month' }],
      });

      // ---- 1a. Force the "no plan selected" state. createPlaywrightTestAccount
      //          auto-binds the new tenant to the app's hardcoded `TEAM` trial
      //          plan, so `shouldSelectPlan` would be `false` out of the gate.
      //          Deleting the TEAM plan leaves the tenant pointing at a plan
      //          key that no longer exists in the app → the API flips
      //          shouldSelectPlan back to `true`. We recreate TEAM in finally
      //          to restore the app's seeded shape (matches the bootstrap from
      //          test-data.service.ts:398).
      //
      //          The describe runs serially (playwright.config.ts:
      //          fullyParallel: false) so this temporary mutation is safe.
      await testDataClient.deletePlan('TEAM').catch(() => {});

      // ---- 1. Sign in the fresh test user via SDK auth (no plan selected yet)
      await loginViaSdkAuth(page, testUser.email, testUser.password);

      // Tokens should be present after SDK login
      const tokens = await page.evaluate(() => localStorage.getItem('bridge_tokens'));
      expect(tokens).not.toBeNull();

      // ---- 1b. Sanity-check that the API really considers this tenant as
      //          paywall-eligible (shouldSelectPlan=true, paymentsAutoRedirect=true).
      //          Without this assertion, a later paywall-redirect failure could
      //          be misdiagnosed as a UI bug when it is really a tenant-state bug.
      const accessToken = await page.evaluate(() => {
        const raw = localStorage.getItem('bridge_tokens');
        return raw ? JSON.parse(raw).accessToken : null;
      });
      const probeRes = await fetch(`${envConfig.apiBaseUrl}/account/subscription/status`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'x-app-id': envConfig.appId,
        },
      });
      const probeBody = await probeRes.json();
      expect(probeBody.shouldSelectPlan).toBe(true);
      expect(probeBody.paymentsAutoRedirect).toBe(true);

      // ---- 2. Navigate to a protected route → expect paywall redirect to /welcome.
      //         BridgeBootstrap short-circuits after its first run within a
      //         single SPA session (bridgeReadyStore is process-scoped), so
      //         do a full document navigation via the page object directly to
      //         /welcome's pre-condition: hit /protected with a cold bootstrap.
      //         page.goto() is a full navigation, which resets the module
      //         state and triggers a fresh bootstrap with the now-authenticated
      //         token — exactly the scenario the paywall fix targets.
      await page.goto('/protected', { waitUntil: 'commit' });
      await page.waitForURL('**/welcome', { timeout: LONG_TIMEOUT });
      expect(new URL(page.url()).pathname).toBe('/welcome');

      // ---- 3. PlanSelector renders on /welcome and finishes loading
      const planSelector = page.locator('[data-bridge-plan-selector]');
      await expect(planSelector).toBeVisible({ timeout: MED_TIMEOUT });
      await expect(planSelector).not.toHaveAttribute('data-loading', 'true', {
        timeout: LONG_TIMEOUT,
      });

      // ---- 4. Click "Select" on the paid plan card → redirect to Stripe Checkout
      const paidPlanCard = page
        .locator('[data-bridge-plan-card]')
        .filter({ hasText: 'Paywall Pro' });
      await expect(paidPlanCard).toBeVisible({ timeout: MED_TIMEOUT });
      const paidPlanBtn = paidPlanCard.locator('button').first();
      await expect(paidPlanBtn).toBeVisible({ timeout: MED_TIMEOUT });
      await paidPlanBtn.click();

      await page.waitForURL((url) => url.hostname.includes('stripe.com'), {
        timeout: LONG_TIMEOUT,
      });
      expect(page.url()).toContain('stripe.com');

      // ---- 5. Fill Stripe test card (selectors match bridge-api stripe-payment.spec.ts)
      const cardInput = page
        .locator('#cardNumber, [data-testid="card-number-input"], input[name="cardNumber"]')
        .first();
      await cardInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
      await cardInput.fill('4242424242424242');

      const expiryInput = page
        .locator('#cardExpiry, [data-testid="card-expiry-input"], input[name="cardExpiry"]')
        .first();
      await expiryInput.fill('1234'); // 12/34

      const cvcInput = page
        .locator('#cardCvc, [data-testid="card-cvc-input"], input[name="cardCvc"]')
        .first();
      await cvcInput.fill('123');

      const nameInput = page.locator('#billingName, input[name="billingName"]').first();
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill('Playwright Test');
      }

      const zipInput = page
        .locator('#billingPostalCode, input[name="billingPostalCode"]')
        .first();
      if (await zipInput.isVisible().catch(() => false)) {
        await zipInput.fill('12345');
      }

      const submitButton = page.locator('button[type="submit"], .SubmitButton').first();
      await submitButton.click();

      // ---- 6. Stripe processes payment and redirects back to the demo's callback,
      //         which bootstrap recognises (stripe_success=1 + session_id) and
      //         resolves by POSTing /v1/account/stripe/confirm-checkout, refreshing
      //         tokens, and 303-ing to the success redirect (PlanSelector default:
      //         /subscription). Wait until we're back on the demo origin.
      await page.waitForURL(
        (url) => !url.hostname.includes('stripe.com'),
        { timeout: 60_000 } // Stripe processing can take a while
      );
      // Wait for the post-checkout subscription page to finish rendering its
      // active-billing state. networkidle is unreliable here because the demo
      // keeps a persistent Centrifugo WebSocket open — the network never goes
      // idle.
      await expect(page.locator('text=Billing active')).toBeVisible({
        timeout: LONG_TIMEOUT,
      });

      const postCheckoutUrl = page.url();
      const postCheckoutPath = new URL(postCheckoutUrl).pathname;

      // ---- 7. We must NOT have been bounced back to /welcome — the whole point
      //         of the paywall fix is that a paid user lands in the app.
      expect(postCheckoutPath).not.toBe('/welcome');
      expect(postCheckoutUrl).not.toContain('stripe.com');

      // ---- 8. Bonus: navigating to a fresh protected route should now succeed,
      //         not redirect to /welcome.
      await page.goto('/protected');
      // No networkidle wait — Centrifugo WebSocket prevents it. The h1
      // assertion below provides the deterministic "page settled" check.
      // The bootstrap may briefly transit through redirects; assert the final URL.
      const finalPath = new URL(page.url()).pathname;
      expect(finalPath).not.toBe('/welcome');
      expect(finalPath).toBe('/protected');

      // The protected page should render its heading once it settles.
      await expect(page.locator('h1:has-text("Protected Page")')).toBeVisible({
        timeout: MED_TIMEOUT,
      });
    } finally {
      // ---- Cleanup: delete the plan we created, restore the TEAM trial plan
      //               that other tests rely on, and disable Stripe on the test
      //               app. The testUser is auto-cleaned by the fixture.
      await testDataClient.deletePlan(planKey).catch(() => {});
      await testDataClient
        .createPlan({
          key: 'TEAM',
          name: 'Team',
          trial: true,
          trialDays: 14,
          prices: [{ amount: 99, currency: 'EUR', recurrenceInterval: 'month' }],
        })
        .catch(() => {});
      await testDataClient
        .configureApp({ paymentsAutoRedirect: false, stripeEnabled: false })
        .catch(() => {});
    }
  });
});
