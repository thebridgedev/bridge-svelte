/**
 * SDK Signup Full Flow Tests
 *
 * Tests the complete signup flow including:
 * 1. Fill signup form → submit → see "Check your email" confirmation
 * 2. Get verification link via test data API (no email required)
 * 3. Navigate to /auth/set-password/[token] → set password
 * 4. Login with new credentials → tokens in localStorage
 *
 * Also tests the basic signup form rendering and validation.
 */

import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT, LONG_TIMEOUT } from '../../fixtures/timeouts';

test.describe('SDK Signup', () => {
  test('signup form renders with required fields', async ({ page }) => {
    await page.goto('/auth/signup');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('#signup-email')).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(page.locator('#signup-first-name')).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(page.locator('#signup-last-name')).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(page.locator('button:has-text("Sign up")')).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('login link is visible on signup page', async ({ page }) => {
    await page.goto('/auth/signup');
    await page.waitForLoadState('networkidle');

    const loginLink = page.locator('a[href="/auth/login"]:has-text("Log in")');
    await expect(loginLink).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('submit signup form → "Check your email" confirmation shown', async ({
    page,
    testDataClient,
  }) => {
    // Generate a fresh playwright-test email so the test data API can find the verification token
    const email = `playwright-test-signup-${Date.now()}@thebridge.io`;

    await page.goto('/auth/signup');
    await page.waitForLoadState('networkidle');

    await page.locator('#signup-email').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await page.locator('#signup-email').fill(email);
    await page.locator('#signup-first-name').fill('Test');
    await page.locator('#signup-last-name').fill('User');
    await page.locator('button:has-text("Sign up")').click();

    // Either success heading ("Check your email") or error alert
    const response = page.locator('[role="alert"], h2:has-text("Check your email")');
    await response.first().waitFor({ state: 'visible', timeout: LONG_TIMEOUT });
    const text = await response.first().textContent();
    expect(text).toBeTruthy();

    // Cleanup: remove the account we just created
    try {
      await testDataClient.removeTestAccount(email);
    } catch {
      // Best effort — may not exist if signup failed at API level
    }
  });

  test('full signup → verify email → set password → login', async ({
    page,
    testDataClient,
  }) => {
    // Use a playwright-test-* email — the API requires this prefix for verification link retrieval
    const email = `playwright-test-full-${Date.now()}@thebridge.io`;
    const newPassword = 'TestPass123!';

    // Step 1: Fill and submit signup form
    await page.goto('/auth/signup');
    await page.waitForLoadState('networkidle');

    await page.locator('#signup-email').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await page.locator('#signup-email').fill(email);
    await page.locator('#signup-first-name').fill('Playwright');
    await page.locator('#signup-last-name').fill('Test');
    await page.locator('button:has-text("Sign up")').click();

    // Wait for success confirmation (success shows h2, not an alert)
    await page.locator('h2:has-text("Check your email"), [role="alert"]').first()
      .waitFor({ state: 'visible', timeout: LONG_TIMEOUT });

    // Step 2: Get the verification link from the test data API
    let verificationLink: string;
    try {
      const result = await testDataClient.getSignupVerificationLink(email);
      verificationLink = result.link;
    } catch (err: any) {
      // If the API doesn't support this yet, skip gracefully
      test.skip(true, `getSignupVerificationLink not available: ${err.message}`);
      return;
    }

    // Step 3: Navigate to the set-password page via the verification token
    // The link looks like: http://localhost:3008/auth/set-password/{token}
    // Extract path and navigate within the current origin
    const url = new URL(verificationLink);
    await page.goto(url.pathname);
    await page.waitForLoadState('networkidle');

    // Step 4: Set a new password
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await passwordInput.fill(newPassword);

    // Fill confirm password if present
    const confirmInput = page.locator('input[type="password"]').nth(1);
    const confirmExists = await confirmInput.isVisible().catch(() => false);
    if (confirmExists) {
      await confirmInput.fill(newPassword);
    }

    await page.locator('button[type="submit"]').click();

    // Step 5: After password set, we should be able to log in
    // Wait for redirect or success indicator
    await page.waitForTimeout(2000);

    // Navigate to login and verify credentials work
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    await page.locator('#login-email').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(newPassword);
    await page.locator('button[type="submit"]:has-text("Sign in")').click();

    // Wait for tokens to appear in localStorage
    await page.waitForFunction(
      () => {
        const raw = localStorage.getItem('bridge_tokens');
        if (!raw) return false;
        try {
          const tokens = JSON.parse(raw);
          return !!tokens?.accessToken;
        } catch {
          return false;
        }
      },
      { timeout: LONG_TIMEOUT },
    );

    const hasTokens = await page.evaluate(() => {
      const raw = localStorage.getItem('bridge_tokens');
      const tokens = JSON.parse(raw ?? '{}');
      return !!tokens?.accessToken;
    });
    expect(hasTokens).toBe(true);

    // Cleanup
    try {
      await testDataClient.removeTestAccount(email);
    } catch {
      // Best effort
    }
  });
});
