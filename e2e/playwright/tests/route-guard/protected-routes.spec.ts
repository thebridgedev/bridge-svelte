/**
 * Protected Routes Tests
 *
 * Verifies that protected routes redirect unauthenticated users to login,
 * and display correct content when authenticated.
 */

import { test, expect } from '../../fixtures/auth';
import { createCleanContext } from '../../fixtures/clean-page';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Protected Routes', () => {
  test('unauthenticated user is redirected away from /protected', async ({ browser }) => {
    const { page, cleanup } = await createCleanContext(browser);

    try {
      await page.goto('/protected');

      // Should be redirected to the login URL (bridge auth)
      // The route guard triggers a redirect to auth.createLoginUrl()
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

  test('authenticated user can access /protected and see profile info', async ({
    authenticatedPage,
    testUser,
  }) => {
    const page = authenticatedPage;

    await page.goto('/protected');
    await page.waitForLoadState('networkidle');

    // Should show the Protected Page heading
    const heading = page.locator('h1:has-text("Protected Page")');
    await expect(heading).toBeVisible({ timeout: MED_TIMEOUT });

    // Should show authentication status
    await expect(page.locator('text=You are currently authenticated')).toBeVisible();

    // Should display profile information
    await expect(page.locator('text=Your Profile')).toBeVisible();
    await expect(page.locator('text=Email')).toBeVisible();
  });

  test('authenticated user sees their email on the protected page', async ({
    authenticatedPage,
    testUser,
  }) => {
    const page = authenticatedPage;

    await page.goto('/protected');
    await page.waitForLoadState('networkidle');

    // Profile is set asynchronously from the ID token; the email appears in a <p> with "Email: ..."
    await expect(
      page.locator('p').filter({ hasText: testUser.email }),
    ).toBeVisible({ timeout: LONG_TIMEOUT });
  });
});
