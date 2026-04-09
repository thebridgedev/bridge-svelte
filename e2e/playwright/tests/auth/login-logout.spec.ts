/**
 * Login & Logout Flow Tests
 *
 * Tests the SDK auth login/logout flow via the embedded LoginForm at /auth/login:
 * - Clicking the Login nav link navigates to /auth/login
 * - Full email → password → tokens flow
 * - After login, navbar shows authenticated links
 * - Logout clears tokens and returns to unauthenticated state
 */

import { test, expect, loginViaSdkAuth } from '../../fixtures/auth';
import { createCleanContext } from '../../fixtures/clean-page';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Login & Logout Flow', () => {
  test('Login nav link navigates to /auth/login', async ({ browser }) => {
    const { page, cleanup } = await createCleanContext(browser);

    try {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Unauthenticated nav shows a Login link
      const loginLink = page.locator('a.nav-link--login');
      await expect(loginLink).toBeVisible({ timeout: MED_TIMEOUT });
      await loginLink.click();

      await expect(page).toHaveURL(/\/auth\/login/, { timeout: LONG_TIMEOUT });
    } finally {
      await cleanup();
    }
  });

  test('full SDK login flow creates valid tokens', async ({
    browser,
    testUser,
  }) => {
    const { page, cleanup } = await createCleanContext(browser);

    try {
      await loginViaSdkAuth(page, testUser.email, testUser.password);

      const tokenData = await page.evaluate(() => {
        const raw = localStorage.getItem('bridge_tokens');
        return raw ? JSON.parse(raw) : null;
      });

      expect(tokenData).not.toBeNull();
      expect(tokenData.accessToken).toBeTruthy();
      expect(tokenData.refreshToken).toBeTruthy();
      expect(tokenData.idToken).toBeTruthy();
    } finally {
      await cleanup();
    }
  });

  test('after login, navbar shows authenticated navigation links', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Authenticated nav should show these links
    await expect(page.locator('a.nav-link:has-text("Home")')).toBeVisible({
      timeout: MED_TIMEOUT,
    });
    await expect(page.locator('a.nav-link:has-text("Team Management")')).toBeVisible();
    await expect(page.locator('a.nav-link:has-text("Protected Page")')).toBeVisible();

    // Logout button visible, Login link gone from navbar
    await expect(page.locator('button:has-text("Logout")')).toBeVisible();
    await expect(page.locator('nav a[href="/auth/login"]')).not.toBeVisible();
  });

  test('logout clears tokens and shows Login link again', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('button:has-text("Logout")')).toBeVisible({
      timeout: MED_TIMEOUT,
    });

    await page.locator('button:has-text("Logout")').click();

    // Wait for logout to complete — the Login link reappears in the navbar
    await expect(page.locator('nav a[href="/auth/login"]')).toBeVisible({
      timeout: MED_TIMEOUT,
    });

    // Tokens should be cleared
    const hasTokens = await page.evaluate(() => {
      const raw = localStorage.getItem('bridge_tokens');
      if (!raw) return false;
      try {
        return !!JSON.parse(raw)?.accessToken;
      } catch {
        return false;
      }
    });

    expect(hasTokens).toBe(false);
  });
});
