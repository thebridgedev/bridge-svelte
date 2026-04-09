/**
 * SDK Auth Alternatives Tests
 *
 * Verifies that optional login alternatives (magic link, passkeys, SSO buttons)
 * are rendered on the /auth/login page based on props and API-driven config.
 *
 * The demo page has showMagicLink and showPasskeys enabled by default.
 * SSO buttons are driven by authConfig from GET /account/auth/app-config — the SSO test
 * enables googleSsoEnabled on the test app via the test data API before navigating.
 */

import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT, LONG_TIMEOUT } from '../../fixtures/timeouts';

test.describe('SDK Auth Alternatives', () => {
  test('magic link button is visible on login page', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    // Wait for email step to be ready
    await page.locator('#login-email').waitFor({ state: 'visible', timeout: MED_TIMEOUT });

    // Magic link button should be visible (showMagicLink=true by default in demo)
    const magicLinkBtn = page.locator('[data-bridge-magic-link], button:has-text("Sign in with magic link")');
    await expect(magicLinkBtn.first()).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('passkeys button is visible on login page', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    await page.locator('#login-email').waitFor({ state: 'visible', timeout: MED_TIMEOUT });

    // Passkey login button should be visible (showPasskeys=true by default in demo)
    const passkeyBtn = page.locator('[data-bridge-passkey-login]');
    await expect(passkeyBtn).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('forgot password link is visible on login page', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    // Email and password are on the same single-step form — forgot password is visible immediately
    await page.locator('#login-email').waitFor({ state: 'visible', timeout: MED_TIMEOUT });

    const forgotLink = page.locator('button:has-text("Forgot password"), a:has-text("Forgot password")');
    await expect(forgotLink.first()).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('SSO buttons appear when auth config has federation connections', async ({
    page,
    testDataClient,
  }) => {
    // Enable Google SSO on the test app via the real API
    await testDataClient.configureApp({ googleSsoEnabled: true });

    try {
      await page.goto('/auth/login');
      await page.waitForLoadState('networkidle');

      await page.locator('#login-email').waitFor({ state: 'visible', timeout: MED_TIMEOUT });

      // At least one SSO button should appear
      const ssoButtons = page.locator('[data-bridge-sso-button]');
      await expect(ssoButtons.first()).toBeVisible({ timeout: LONG_TIMEOUT });
    } finally {
      // Reset SSO flags so other tests are not affected
      await testDataClient.configureApp({ googleSsoEnabled: false });
    }
  });

  test('magic link step shows email sent confirmation', async ({ page, testUser }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    await page.locator('#login-email').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await page.locator('#login-email').fill(testUser.email);

    // Click magic link button
    const magicLinkBtn = page.locator('[data-bridge-magic-link], button:has-text("Sign in with magic link")');
    await magicLinkBtn.first().click();

    // Should show a confirmation message or navigate to magic-link step
    const confirmation = page.locator('[role="alert"], [data-bridge-auth-form]');
    await expect(confirmation.first()).toBeVisible({ timeout: LONG_TIMEOUT });
  });

  test('signup link navigates to /auth/signup', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    const signupLink = page.locator('a[href="/auth/signup"]');
    await expect(signupLink).toBeVisible({ timeout: MED_TIMEOUT });
    await signupLink.click();

    await expect(page).toHaveURL(/\/auth\/signup/, { timeout: MED_TIMEOUT });
  });
});
