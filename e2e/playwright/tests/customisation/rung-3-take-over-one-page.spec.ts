/**
 * Customisation level 3 — take over one page (TBP-698).
 *
 * Creating `src/routes/auth/login/+page.svelte` is the whole mechanism:
 * SvelteKit prefers a specific route over `auth/[...bridge]`. The fixture that
 * does it is `demo/src/routes/(test-fixtures)/auth/login/+page.svelte`.
 *
 * The acceptance criterion this exists for: taking over the login page must not
 * affect signup verification. bridge-api writes `/auth/set-password/<token>`
 * into every verification email, and that page has to keep coming from the
 * catch-all while login is the app's own.
 */

import { test, expect } from '../../fixtures/auth';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';

/** The catch-all's wrapper for a page — present only when BridgeAuthRoutes rendered it. */
const served = (page: string) => `[data-bridge-auth-route="${page}"]`;

test.describe('Level 3 — take over one page by creating it (TBP-696, TBP-698)', () => {
  test('the app’s own auth/login/+page.svelte wins over the catch-all', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.locator('[data-demo-login-override] #login-email')).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(page.locator('[data-bridge-auth-route]')).toHaveCount(0);
  });

  test('with login taken over, the pages it does not own still resolve', async ({ page }) => {
    // Precondition, so this can never pass vacuously: login IS taken over.
    await page.goto('/auth/login');
    await expect(page.locator('[data-demo-login-override] #login-email')).toBeVisible({ timeout: MED_TIMEOUT });

    // The fixture owns ONLY login. Before TBP-696 each of these needed its own file.
    for (const [path, route] of [
      ['/auth/set-password/x', 'set-password'],
      ['/auth/signup', 'signup'],
      ['/auth/forgot-password', 'forgot-password'],
    ] as const) {
      await page.goto(path);
      await expect(page.locator(served(route)).locator('[data-bridge-auth-form]'), path).toBeVisible({
        timeout: MED_TIMEOUT,
      });
    }
  });

  test('signup verification lands on a set-password form nobody hand-wrote', async ({
    page,
    testDataClient,
  }) => {
    const email = `iman+playwright-test-authroutes-${Date.now()}@nebulr.group`;
    try {
      await page.goto('/auth/signup');
      await page.locator(`${served('signup')} #signup-email`).fill(email);
      await page.locator('#signup-first-name').fill('Auth');
      await page.locator('#signup-last-name').fill('Routes');
      await page.locator('button:has-text("Sign up")').click();
      await expect(page.locator('h2:has-text("Check your email")')).toBeVisible({ timeout: LONG_TIMEOUT });

      // The exact address bridge-api put in the email.
      const { link } = await testDataClient.getSignupVerificationLink(email);
      const target = new URL(link);
      expect(target.pathname).toMatch(/^\/auth\/set-password\/[^/]+$/);

      await page.goto(`${target.pathname}${target.search}`);
      await expect(page.locator(`${served('set-password')} #newPassword`)).toBeVisible({ timeout: MED_TIMEOUT });
      await expect(page.locator('#confirmPassword')).toBeVisible();
    } finally {
      await testDataClient.removeTestAccount(email).catch(() => {});
    }
  });
});
