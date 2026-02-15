/**
 * Team Management Tests
 *
 * Verifies the TeamManagement component renders on the /team page
 * and loads the iframe with proper authentication handover.
 */

import { test, expect } from '../../fixtures/auth';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Team Management', () => {
  test('/team page renders the Team Management heading', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/team');
    await page.waitForLoadState('networkidle');

    // Should show the Team Management heading
    const heading = page.locator('h1:has-text("Team Management")');
    await expect(heading).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('/team page loads the TeamManagement iframe', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/team');
    await page.waitForLoadState('networkidle');

    // The TeamManagement component renders an iframe
    // Wait for it to appear in the DOM
    const iframe = page.locator('iframe');

    // The iframe should be present (it may take a moment to load)
    await expect(iframe).toBeVisible({ timeout: LONG_TIMEOUT });
  });

  test('/team page iframe has a valid src URL', async ({
    authenticatedPage,
    envConfig,
  }) => {
    const page = authenticatedPage;

    await page.goto('/team');
    await page.waitForLoadState('networkidle');

    const iframe = page.locator('iframe');
    await expect(iframe).toBeVisible({ timeout: LONG_TIMEOUT });

    // The iframe src should point to the team management URL
    const src = await iframe.getAttribute('src');
    expect(src).toBeTruthy();
    // The src should contain a handover-related URL or the team management endpoint
    expect(src).toContain('user-management');
  });

  test('/team is not accessible without authentication', async ({ browser }) => {
    const { createCleanContext } = await import('../../fixtures/clean-page');
    const { page, cleanup } = await createCleanContext(browser);

    try {
      await page.goto('/team');

      // Should be redirected to login since /team is protected by default
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
