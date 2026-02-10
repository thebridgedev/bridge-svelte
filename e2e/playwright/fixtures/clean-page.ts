/**
 * Clean page fixture for tests that need unauthenticated state.
 *
 * Creates a fresh browser context with no stored auth state,
 * useful for testing login flows and public route access.
 *
 * Pattern borrowed from bridge-api/e2e/playwright/fixtures/clean-page.ts
 */

import { type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * Creates a fresh browser context with no auth state.
 *
 * @param browser - Playwright Browser instance
 * @returns Object with clean context and page, plus a cleanup function
 */
export async function createCleanContext(browser: Browser): Promise<{
  context: BrowserContext;
  page: Page;
  cleanup: () => Promise<void>;
}> {
  const context = await browser.newContext({
    // No storageState — starts completely unauthenticated
  });

  const page = await context.newPage();

  return {
    context,
    page,
    cleanup: async () => {
      await page.close();
      await context.close();
    },
  };
}
