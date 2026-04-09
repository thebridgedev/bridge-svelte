/**
 * Create User (Sign Up) Flow Tests
 *
 * Tests the SDK signup form at /auth/signup:
 * - Fill email, first name, last name → submit → success confirmation
 * - Clean up the created account via test data API
 */

import { expect, test } from '../../fixtures/auth';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Create User (Sign Up) Flow', () => {
  test('sign up form creates user and shows success message', async ({
    page,
    testDataClient,
  }) => {
    const signupEmail = `playwright-test-signup-${Date.now()}@thebridge.io`;

    try {
      await page.goto('/auth/signup');
      await page.waitForLoadState('networkidle');

      // Fill signup form
      await page.locator('#signup-email').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
      await page.locator('#signup-email').fill(signupEmail);
      await page.locator('#signup-first-name').fill('Playwright');
      await page.locator('#signup-last-name').fill('Signup');

      await page.locator('button:has-text("Sign up")').click();

      // Should show success state with "Check your email" heading
      const successHeading = page.getByText('Check your email');
      await expect(successHeading).toBeVisible({ timeout: LONG_TIMEOUT });
    } finally {
      try {
        await testDataClient.removeTestAccount(signupEmail);
      } catch {
        // Best effort
      }
    }
  });

  test('signup page has login link', async ({ page }) => {
    await page.goto('/auth/signup');
    await page.waitForLoadState('networkidle');

    const loginLink = page.locator('a[href="/auth/login"]').first();
    await expect(loginLink).toBeVisible({ timeout: MED_TIMEOUT });
  });
});
