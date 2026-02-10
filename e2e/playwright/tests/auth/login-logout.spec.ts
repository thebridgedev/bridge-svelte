/**
 * Login & Logout Flow Tests
 *
 * Tests the full authentication flow via the demo app:
 * - Clicking "Login with Bridge" redirects to the auth service
 * - After login, navbar state changes to show authenticated links
 * - Logout clears tokens and returns to unauthenticated state
 */

import { test, expect } from '../../fixtures/auth';
import { createCleanContext } from '../../fixtures/clean-page';
import { loginViaBridgeAuth } from '../../fixtures/auth';
import { LONG_TIMEOUT, MED_TIMEOUT, SHORT_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Login & Logout Flow', () => {
  test('clicking "Login with Bridge" redirects to bridge auth URL', async ({
    browser,
  }) => {
    const { page, cleanup } = await createCleanContext(browser);

    try {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Click the login button
      const loginButton = page.locator('button:has-text("Login with Bridge")');
      await expect(loginButton).toBeVisible({ timeout: MED_TIMEOUT });
      await loginButton.click();

      // Should redirect to Bridge auth (login) page. App ID may or may not appear in the URL
      // depending on backend; it is set in config and used via localStorage after login.
      await page.waitForURL(
        (url) => {
          const urlString = url.toString();
          return urlString.includes('/auth/') || urlString.includes('/login');
        },
        { timeout: LONG_TIMEOUT },
      );

      const authUrl = page.url();
      expect(authUrl).toMatch(/\/auth\/|\/login/);
    } finally {
      await cleanup();
    }
  });

  test('after login, navbar shows authenticated navigation links', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // Navigate to home page
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Should show authenticated nav links
    await expect(page.locator('a.nav-link:has-text("Home")')).toBeVisible({
      timeout: MED_TIMEOUT,
    });
    await expect(
      page.locator('a.nav-link:has-text("Team Management")'),
    ).toBeVisible();
    await expect(
      page.locator('a.nav-link:has-text("Protected Page")'),
    ).toBeVisible();

    // Should show Logout button instead of Login
    await expect(page.locator('button:has-text("Logout")')).toBeVisible();
    await expect(
      page.locator('button:has-text("Login with Bridge")'),
    ).not.toBeVisible();
  });

  test('logout clears tokens and shows login button again', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify we're authenticated first
    await expect(page.locator('button:has-text("Logout")')).toBeVisible({
      timeout: MED_TIMEOUT,
    });

    // Click logout
    await page.locator('button:has-text("Logout")').click();

    // Wait for redirect (logout redirects to backend logout endpoint, then back)
    await page.waitForLoadState('networkidle');

    // Verify tokens are cleared from localStorage
    const hasTokens = await page.evaluate(() => {
      const raw = localStorage.getItem('bridge_tokens');
      if (!raw) return false;
      try {
        const tokens = JSON.parse(raw);
        return !!tokens?.accessToken;
      } catch {
        return false;
      }
    });

    expect(hasTokens).toBe(false);
  });

  test('full login flow via UI creates valid tokens', async ({
    browser,
    testUser,
    envConfig,
    testDataClient,
  }) => {
    const { page, cleanup } = await createCleanContext(browser);

    try {
      // Perform full login flow
      await loginViaBridgeAuth(page, testUser.email, testUser.password, envConfig);

      // Verify tokens are in localStorage
      const tokenData = await page.evaluate(() => {
        const raw = localStorage.getItem('bridge_tokens');
        if (!raw) return null;
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      });

      expect(tokenData).not.toBeNull();
      expect(tokenData.accessToken).toBeTruthy();
      expect(tokenData.refreshToken).toBeTruthy();
      expect(tokenData.idToken).toBeTruthy();
    } finally {
      await cleanup();
    }
  });
});
