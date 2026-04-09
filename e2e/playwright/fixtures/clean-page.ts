/**
 * Clean page fixture for tests that need unauthenticated state.
 *
 * Creates a fresh browser context with no stored auth state,
 * useful for testing login flows and public route access.
 *
 * Pattern borrowed from bridge-api/e2e/playwright/fixtures/clean-page.ts
 */

import * as path from 'path';
import { type Browser, type BrowserContext, type Page } from '@playwright/test';

// Base state contains only the app ID in localStorage (no auth tokens).
const BASE_STATE_PATH = path.resolve(__dirname, '../.auth/base-state.json');

/**
 * Creates a fresh browser context with no auth state but with the E2E app ID.
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
    // Include base state (app ID only) but no auth tokens
    storageState: BASE_STATE_PATH,
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
