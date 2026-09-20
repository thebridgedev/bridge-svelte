/**
 * Subscription Plan Tests
 *
 * Verifies the PlanSelector component renders on the /subscription page,
 * loads plans from the API, and handles plan selection flows.
 */

import { test, expect } from '../../fixtures/auth';
import { createCleanContext } from '../../fixtures/clean-page';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Subscription Plans', () => {
  test('/subscription page renders plan cards', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto('/subscription');

    // Wait for plan selector to stop loading
    const planSelector = page.locator('[data-bridge-plan-selector]');
    await expect(planSelector).toBeVisible({ timeout: MED_TIMEOUT });

    // Wait until data-loading is false
    await expect(planSelector).not.toHaveAttribute('data-loading', 'true', { timeout: LONG_TIMEOUT });

    // Should show at least one plan card (or the empty state).
    //
    // Web-first, not a one-shot `count()`/`isVisible()` pair: `not.toHaveAttribute`
    // above is also satisfied while the attribute is simply *absent*, which it is
    // for a frame before PlanSelector sets `data-loading="true"`. Reading the counts
    // once at that instant sees zero cards on a page that renders them a tick later
    // — the failure then claims there are no plans when the captured snapshot plainly
    // shows them.
    const planCards = page.locator('[data-bridge-plan-card]');
    const emptyState = page.locator('.bridge-plan-empty');

    await expect(planCards.first().or(emptyState)).toBeVisible({ timeout: LONG_TIMEOUT });
  });

  test('/subscription page shows plan selector in correct state', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    await page.goto('/subscription');

    const planSelector = page.locator('[data-bridge-plan-selector]');
    await expect(planSelector).toBeVisible({ timeout: MED_TIMEOUT });

    // Wait for loading to finish
    await expect(planSelector).not.toHaveAttribute('data-loading', 'true', { timeout: LONG_TIMEOUT });

    // State should be one of the valid UI states
    const state = await planSelector.getAttribute('data-state');
    expect(['idle', 'select-plan', 'active', 'trial', 'payment-failed', 'setup-payments']).toContain(state);
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
    // Statically imported, like every other spec that needs a clean context.
    // A dynamic `await import()` of this .ts fixture is not transpiled by the
    // Playwright loader and dies at runtime with "Cannot use import statement
    // outside a module" — the test never reached its first assertion.
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
