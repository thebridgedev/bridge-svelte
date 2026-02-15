/**
 * Token Persistence Tests
 *
 * Verifies that authentication tokens persist across page reloads
 * (stored in localStorage under 'bridge_tokens').
 */

import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Token Persistence', () => {
  test('tokens survive page reload', async ({ authenticatedPage }) => {
    const page = authenticatedPage;

    // Get tokens before reload
    const tokensBefore = await page.evaluate(() => {
      const raw = localStorage.getItem('bridge_tokens');
      return raw ? JSON.parse(raw) : null;
    });

    expect(tokensBefore).not.toBeNull();
    expect(tokensBefore.accessToken).toBeTruthy();

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Get tokens after reload
    const tokensAfter = await page.evaluate(() => {
      const raw = localStorage.getItem('bridge_tokens');
      return raw ? JSON.parse(raw) : null;
    });

    // Tokens should still be present
    expect(tokensAfter).not.toBeNull();
    expect(tokensAfter.accessToken).toBeTruthy();
    expect(tokensAfter.refreshToken).toBeTruthy();
  });

  test('user remains authenticated after page reload', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify authenticated state
    await expect(page.locator('button:has-text("Logout")')).toBeVisible({
      timeout: MED_TIMEOUT,
    });

    // Reload
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still be authenticated — Logout button should still be visible
    await expect(page.locator('button:has-text("Logout")')).toBeVisible({
      timeout: MED_TIMEOUT,
    });
  });

  test('protected page is accessible after reload', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // Navigate to protected page
    await page.goto('/protected');
    await page.waitForLoadState('networkidle');

    // Should show profile info
    await expect(page.locator('h1:has-text("Protected Page")')).toBeVisible({
      timeout: MED_TIMEOUT,
    });

    // Reload
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still show protected page content (not redirect to login)
    await expect(page.locator('h1:has-text("Protected Page")')).toBeVisible({
      timeout: MED_TIMEOUT,
    });
    await expect(
      page.locator('text=You are currently authenticated'),
    ).toBeVisible();
  });
});
