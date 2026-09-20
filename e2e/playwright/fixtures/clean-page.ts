/**
 * Clean page fixture for tests that need unauthenticated state.
 *
 * Creates a fresh browser context with no stored auth state,
 * useful for testing login flows and public route access.
 *
 * Pattern borrowed from bridge-api/e2e/playwright/fixtures/clean-page.ts
 */

import { type Browser, type BrowserContext, type Page } from '@playwright/test';
import { currentWorkerApp } from './worker-app';

/**
 * Creates a fresh browser context with no auth state but with the E2E app ID.
 *
 * The app id is this WORKER's app (TBP-604), not a suite-wide one — a context
 * built here has to boot the demo against the same app the rest of the worker's
 * test is talking to, or the test would read one app's settings while the
 * fixtures wrote another's.
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
    // Include the worker's app-id state (app ID only) but no auth tokens
    storageState: currentWorkerApp().storageStatePath,
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
