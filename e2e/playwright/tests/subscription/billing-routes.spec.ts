/**
 * One file serves the subscription page, the paywall and the checkout return
 * pages (TBP-702).
 *
 * The demo's `src/routes/subscription/[...bridge]/+page.svelte` is exactly what
 * the billing guide tells an app to write: `<BridgeBillingRoutes />`. Its
 * `welcome/+page.svelte` is the optional onboarding page, `<BridgePaywallPage>`,
 * opted into with `billing: { paywallRoute: '/welcome' }` in +layout.ts.
 * `/billing-framed/[...bridge]` is the same component with the `frame` and
 * `heading` snippets, mounted somewhere else.
 *
 * The regression this exists for: the plugin redirected a failed checkout to
 * `/payment-error` and pointed every Manage/Upgrade button at `/billing`, and no
 * guide told anyone to create either page — two 404s waiting in every
 * guide-following app.
 */

import type { Page } from '@playwright/test';
import { test, expect, loginViaSdkAuth, readBridgeTokens } from '../../fixtures/auth';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';

/** The catch-all's wrapper for a page — present only when BridgeBillingRoutes rendered it. */
const served = (page: string) => `[data-bridge-billing-route="${page}"]`;

const STRIPE_TEST_PK = process.env.STRIPE_TEST_PK || '';
const STRIPE_TEST_SK = process.env.STRIPE_TEST_SK || '';

test.describe('BridgeBillingRoutes — every billing page from one file (TBP-702)', () => {
  test('each segment renders its page', async ({ authenticatedPage: page }) => {
    await page.goto('/subscription');
    await expect(page.locator(`${served('manage')} [data-bridge-plan-selector]`)).toBeVisible({ timeout: LONG_TIMEOUT });
    await expect(page.locator(`${served('manage')} .bridge-subscription-status`)).toBeVisible();

    await page.goto('/subscription/plan');
    await expect(page.locator(`${served('plan')} [data-bridge-plan-selector]`)).toBeVisible({ timeout: LONG_TIMEOUT });

    await page.goto('/subscription/success');
    await expect(page.locator(served('success')).getByRole('heading', { name: "You're all set" })).toBeVisible({
      timeout: MED_TIMEOUT,
    });
    await expect(page.locator(served('success')).getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/');

    await page.goto('/subscription/error');
    const error = page.locator(served('error'));
    await expect(error.getByRole('heading', { name: "We couldn't confirm your payment" })).toBeVisible({
      timeout: MED_TIMEOUT,
    });
    await expect(error.getByRole('link', { name: 'Back to subscription' })).toHaveAttribute('href', '/subscription');
  });

  test('an unknown segment gets the app’s own 404, not a page', async ({ authenticatedPage: page }) => {
    for (const path of ['/subscription/not-a-page', '/subscription/plan/extra', '/subscription/login']) {
      await page.goto(path);
      await expect(page.getByText('404').first(), path).toBeVisible({ timeout: MED_TIMEOUT });
      await expect(page.locator('[data-bridge-billing-route]'), path).toHaveCount(0);
    }
  });

  test('a failed checkout confirmation lands on /subscription/error', async ({ authenticatedPage: page }) => {
    // What Stripe's success URL looks like when it comes back — with a session
    // Bridge cannot confirm. bridgeBootstrap's load redirects before any page renders.
    const redirectTo = encodeURIComponent('/subscription/success');
    await page.goto(`/auth/oauth-callback?stripe_success=1&session_id=cs_test_not_a_session&redirect=${redirectTo}`);
    await page.waitForURL((url) => url.pathname === '/subscription/error', { timeout: LONG_TIMEOUT });
    await expect(page.locator(served('error'))).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('the billing notice’s Manage button lands on /subscription', async ({ authenticatedPage: page }) => {
    await page.goto('/billing-lifecycle');
    await page.getByRole('button', { name: /Past due — card declined/ }).click();
    await page.getByTestId('default-cta').check();
    const cta = page.locator('.bridge-billing-notice .bbn-cta');
    await expect(cta).toBeVisible({ timeout: MED_TIMEOUT });
    await cta.click();
    await page.waitForURL((url) => url.pathname === '/subscription', { timeout: LONG_TIMEOUT });
    await expect(page.locator(served('manage'))).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('frame and heading snippets restyle it, and links follow where it lives', async ({ authenticatedPage: page }) => {
    await page.goto('/billing-framed/plan');
    const frame = page.getByTestId('billing-frame');
    await expect(frame).toHaveAttribute('data-page', 'plan', { timeout: MED_TIMEOUT });
    await expect(frame.getByTestId('billing-heading')).toHaveText('Billing · plan');
    await expect(frame.locator('.bridge-billing-heading')).toHaveCount(0);
    await expect(frame.locator('[data-bridge-plan-selector]')).toBeVisible({ timeout: LONG_TIMEOUT });

    await page.goto('/billing-framed/error');
    await expect(page.getByTestId('billing-frame').getByRole('link', { name: 'Back to subscription' })).toHaveAttribute(
      'href',
      '/billing-framed',
    );
  });
});

test.describe('The paywall points at a page that exists (TBP-702)', () => {
  test.skip(!STRIPE_TEST_PK || !STRIPE_TEST_SK, 'needs STRIPE_TEST_PK / STRIPE_TEST_SK to make a workspace plan-less');

  /** Records whether the protected page's heading ever reached the DOM. */
  async function watchForProtectedPage(page: Page) {
    await page.addInitScript(() => {
      const w = window as unknown as { __protectedRendered?: boolean };
      w.__protectedRendered = false;
      new MutationObserver(() => {
        for (const h of document.querySelectorAll('h1')) {
          if (h.textContent?.includes('Protected Page')) w.__protectedRendered = true;
        }
      }).observe(document, { childList: true, subtree: true });
    });
  }

  async function signInPlanless(
    page: Page,
    testUser: { email: string; password: string; tenantId: string },
    testDataClient: {
      configureApp: (c: Record<string, unknown>) => Promise<unknown>;
      clearTenantPlan: (id: string) => Promise<{ shouldSelectPlan: boolean }>;
    },
  ) {
    await testDataClient.configureApp({
      paymentsAutoRedirect: true,
      stripeEnabled: true,
      stripePublicKey: STRIPE_TEST_PK,
      stripeSecretKey: STRIPE_TEST_SK,
    });
    const cleared = await testDataClient.clearTenantPlan(testUser.tenantId);
    expect(cleared.shouldSelectPlan).toBe(true);
    await loginViaSdkAuth(page, testUser.email, testUser.password);
    expect((await readBridgeTokens(page))?.accessToken).toBeTruthy();
  }

  test('with nothing configured, a plan-less workspace lands on /subscription/plan before any page renders', async ({
    page,
    testUser,
    testDataClient,
  }) => {
    await signInPlanless(page, testUser, testDataClient);
    // Drop the demo's /welcome opt-in: this is an app that configures nothing.
    await page.evaluate(() => localStorage.setItem('bridge:defaultPaywall', 'true'));
    await watchForProtectedPage(page);

    await page.goto('/protected', { waitUntil: 'commit' });
    await page.waitForURL((url) => url.pathname === '/subscription/plan', { timeout: LONG_TIMEOUT });
    await expect(page.locator(`${served('plan')} [data-bridge-plan-selector]`)).toBeVisible({ timeout: LONG_TIMEOUT });
    expect(await page.evaluate(() => (window as unknown as { __protectedRendered?: boolean }).__protectedRendered)).toBe(
      false,
    );

    // The payment-error page stays readable for the same workspace.
    await page.goto('/subscription/error');
    await expect(page.locator(served('error'))).toBeVisible({ timeout: MED_TIMEOUT });
    expect(new URL(page.url()).pathname).toBe('/subscription/error');
  });

  test('an app without billing (no plans) keeps plan-less workspaces in the app', async ({
    page,
    testUser,
    testDataClient,
  }) => {
    // Every workspace of an app that never set billing up is plan-less. The
    // default paywall must not send them to a page such an app does not have.
    // The worker app's plan catalogue is shared, so "no plans" is the API's
    // answer for this page only.
    await page.route('**/account/subscription/plans', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await testDataClient.configureApp({ paymentsAutoRedirect: true, stripeEnabled: false });
    const cleared = await testDataClient.clearTenantPlan(testUser.tenantId);
    expect(cleared.shouldSelectPlan).toBe(true);
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('bridge:defaultPaywall', 'true'));
    await loginViaSdkAuth(page, testUser.email, testUser.password);

    // Both paywall checks read the plan list: the load's, and <BridgeBootstrap>'s
    // reactive one. Once it has been served, neither may have moved the page.
    const plansServed = page.waitForResponse('**/account/subscription/plans', { timeout: LONG_TIMEOUT });
    await page.goto('/protected');
    await plansServed;
    await expect(page.locator('h1:has-text("Protected Page")')).toBeVisible({ timeout: LONG_TIMEOUT });
    await page.waitForTimeout(1_000);
    expect(new URL(page.url()).pathname).toBe('/protected');
  });

  test('the /welcome opt-in moves the paywall there', async ({ page, testUser, testDataClient }) => {
    await signInPlanless(page, testUser, testDataClient);
    await page.evaluate(() => localStorage.removeItem('bridge:defaultPaywall'));
    await watchForProtectedPage(page);

    await page.goto('/protected', { waitUntil: 'commit' });
    await page.waitForURL((url) => url.pathname === '/welcome', { timeout: LONG_TIMEOUT });
    const paywall = page.locator('[data-bridge-paywall-page]');
    await expect(paywall.getByRole('heading', { name: 'Pick a plan to get started' })).toBeVisible({
      timeout: MED_TIMEOUT,
    });
    await expect(paywall.locator('[data-bridge-plan-selector]')).toBeVisible({ timeout: LONG_TIMEOUT });
    expect(await page.evaluate(() => (window as unknown as { __protectedRendered?: boolean }).__protectedRendered)).toBe(
      false,
    );
  });
});
