/**
 * Subscription Plan Tests
 *
 * Verifies the PlanSelector component renders on the /subscription page,
 * loads plans from the API, and handles plan selection flows.
 */

import { test, expect } from '../../fixtures/auth';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Subscription Plans', () => {
  test('/subscription page renders plan cards', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto('/subscription');
    await page.waitForLoadState('networkidle');

    // Wait for plan selector to stop loading
    const planSelector = page.locator('[data-bridge-plan-selector]');
    await expect(planSelector).toBeVisible({ timeout: MED_TIMEOUT });

    // Wait until data-loading is false
    await expect(planSelector).not.toHaveAttribute('data-loading', 'true', { timeout: LONG_TIMEOUT });

    // Should show at least one plan card (or empty state)
    const planCards = page.locator('[data-bridge-plan-card]');
    const emptyState = page.locator('.bridge-plan-empty');

    const cardCount = await planCards.count();
    const hasEmpty = await emptyState.isVisible();

    expect(cardCount > 0 || hasEmpty).toBeTruthy();
  });

  test('/subscription page shows plan selector in correct state', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto('/subscription');
    await page.waitForLoadState('networkidle');

    const planSelector = page.locator('[data-bridge-plan-selector]');
    await expect(planSelector).toBeVisible({ timeout: MED_TIMEOUT });

    // Wait for loading to finish
    await expect(planSelector).not.toHaveAttribute('data-loading', 'true', { timeout: LONG_TIMEOUT });

    // State should be one of the valid UI states
    const state = await planSelector.getAttribute('data-state');
    expect(['idle', 'select-plan', 'active', 'trial', 'payment-failed', 'setup-payments']).toContain(state);
  });

  test('/subscription free plan selection triggers selectFreePlan API call', async ({ authenticatedPage, envConfig }) => {
    const page = authenticatedPage;

    // Mock the subscription API endpoints to return a predictable state
    await page.route(`${envConfig.apiBaseUrl}/account/subscription/status`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          paymentsEnabled: false,
          shouldSelectPlan: true,
          shouldSetupPayments: false,
          paymentFailed: false,
          trial: false,
          trialDaysLeft: 0,
        }),
      });
    });

    await page.route(`${envConfig.apiBaseUrl}/account/subscription/plans`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            key: 'free',
            name: 'Free',
            description: 'Free plan for testing',
            trial: false,
            trialDays: 0,
            prices: [{ amount: 0, currency: 'usd', recurrenceInterval: 'month' }],
          },
        ]),
      });
    });

    // Intercept the selectFreePlan call
    let selectCalled = false;
    await page.route(`${envConfig.apiBaseUrl}/account/subscription/select`, (route) => {
      selectCalled = true;
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/subscription');
    await page.waitForLoadState('networkidle');

    const planSelector = page.locator('[data-bridge-plan-selector]');
    await expect(planSelector).not.toHaveAttribute('data-loading', 'true', { timeout: LONG_TIMEOUT });

    // Click "Select free plan" button
    const selectBtn = page.locator('[data-bridge-plan-card] button:has-text("Select free plan")').first();
    await expect(selectBtn).toBeVisible({ timeout: MED_TIMEOUT });
    await selectBtn.click();

    // Wait for the API call to be intercepted
    await page.waitForTimeout(1000);
    expect(selectCalled).toBeTruthy();
  });

  test('/subscription paid plan click triggers checkout API call', async ({ authenticatedPage, envConfig }) => {
    const page = authenticatedPage;

    // Mock subscription status — no payment setup yet
    await page.route(`${envConfig.apiBaseUrl}/account/subscription/status`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          paymentsEnabled: false,
          shouldSelectPlan: true,
          shouldSetupPayments: false,
          paymentFailed: false,
          trial: false,
          trialDaysLeft: 0,
        }),
      });
    });

    await page.route(`${envConfig.apiBaseUrl}/account/subscription/plans`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            key: 'pro',
            name: 'Pro',
            description: 'Pro plan',
            trial: false,
            trialDays: 0,
            prices: [{ amount: 2900, currency: 'usd', recurrenceInterval: 'month' }],
          },
        ]),
      });
    });

    // Intercept checkout call
    let checkoutBody: unknown = null;
    await page.route(`${envConfig.apiBaseUrl}/account/subscription/checkout`, async (route) => {
      checkoutBody = JSON.parse(route.request().postData() ?? '{}');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessionId: 'cs_test_mock', publicKey: 'pk_test_mock' }),
      });
    });

    await page.goto('/subscription');
    await page.waitForLoadState('networkidle');

    const planSelector = page.locator('[data-bridge-plan-selector]');
    await expect(planSelector).not.toHaveAttribute('data-loading', 'true', { timeout: LONG_TIMEOUT });

    // Click the paid plan button
    const selectBtn = page.locator('[data-bridge-plan-card] button').first();
    await expect(selectBtn).toBeVisible({ timeout: MED_TIMEOUT });
    await selectBtn.click();

    // Wait for checkout API call
    await page.waitForTimeout(1500);

    expect(checkoutBody).not.toBeNull();
    const body = checkoutBody as Record<string, unknown>;
    expect(body.planKey).toBe('pro');
  });

  test('/subscription shows payment failed banner when paymentFailed is true', async ({ authenticatedPage, envConfig }) => {
    const page = authenticatedPage;

    // Mock a payment-failed state
    await page.route(`${envConfig.apiBaseUrl}/account/subscription/status`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          paymentsEnabled: true,
          shouldSelectPlan: false,
          shouldSetupPayments: false,
          paymentFailed: true,
          trial: false,
          trialDaysLeft: 0,
          plan: { key: 'pro', name: 'Pro', trial: false, trialDays: 0, prices: [] },
        }),
      });
    });

    await page.route(`${envConfig.apiBaseUrl}/account/subscription/plans`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/subscription');
    await page.waitForLoadState('networkidle');

    const planSelector = page.locator('[data-bridge-plan-selector]');
    await expect(planSelector).not.toHaveAttribute('data-loading', 'true', { timeout: LONG_TIMEOUT });
    await expect(planSelector).toHaveAttribute('data-state', 'payment-failed');

    // Payment failed banner should be visible
    const banner = page.locator('[data-bridge-plan-payment-failed]');
    await expect(banner).toBeVisible({ timeout: MED_TIMEOUT });

    // "Manage billing" button should be present
    const portalBtn = banner.locator('button:has-text("Manage billing")');
    await expect(portalBtn).toBeVisible();
  });

  test('/subscription is not accessible without authentication', async ({ browser }) => {
    const { createCleanContext } = await import('../../fixtures/clean-page');
    const { page, cleanup } = await createCleanContext(browser);

    try {
      await page.goto('/subscription');

      // Should be redirected to login since /subscription is protected by default
      await page.waitForURL(
        (url) => {
          const urlString = url.toString();
          return urlString.includes('/auth/') || urlString.includes('/login');
        },
        { timeout: LONG_TIMEOUT },
      );

      const currentUrl = page.url();
      expect(
        currentUrl.includes('/auth/') || currentUrl.includes('/login'),
      ).toBeTruthy();
    } finally {
      await cleanup();
    }
  });
});
