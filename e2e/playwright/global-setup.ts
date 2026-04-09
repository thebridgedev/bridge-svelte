/**
 * Global setup for bridge-svelte Playwright E2E tests.
 *
 * Runs once before all tests (after the demo app is already started).
 *
 * The test app was already created by pre-setup.ts (which runs before Playwright).
 * This global setup:
 * 1. Fetches the test app info and stores it in process.env for tests
 * 2. Sets the app ID via the ConfigStatus UI in the demo app
 * 3. Saves the resulting storage state to base-state.json for all tests to inherit
 * 4. Purges stale playwright test accounts
 *
 * Pattern borrowed from bridge-api/e2e/playwright/global-setup.ts
 */

import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { createTestDataClientFromEnv } from './utils/test-data-client';

async function globalSetup() {
  console.log('\n========================================');
  console.log('  bridge-svelte E2E Global Setup');
  console.log('========================================\n');

  // 1. Validate required environment variables
  const requiredVars = ['PLAYWRIGHT_TEST_API_KEY'];
  const missing = requiredVars.filter((v) => !process.env[v]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}.\n` +
        `Copy config/.env.test.local.example to config/.env.test.local and fill in the values.`,
    );
  }

  console.log('[global-setup] Environment variables validated');

  // 2. Fetch test app info (already created by pre-setup.ts)
  const testDataClient = createTestDataClientFromEnv();

  const testAppDomain = process.env.TEST_APP_DOMAIN || 'BRIDGE_SVELTE_TEST_DASHBOARD';
  const testAppName = process.env.TEST_APP_NAME || 'Bridge Svelte Test Dashboard';
  const ownerEmail = process.env.TEST_OWNER_EMAIL || 'playwright-e2e@thebridge.io';
  const ownerPassword = process.env.TEST_OWNER_PASSWORD || 'helloworld';

  console.log(`[global-setup] Fetching test app (domain: ${testAppDomain})...`);

  let appId: string;

  try {
    const appUrl = process.env.LOCAL_BASE_URL || 'http://localhost:3001';
    const result = await testDataClient.setupTestApp(
      testAppDomain,
      testAppName,
      ownerEmail,
      ownerPassword,
      appUrl,
    );

    appId = result.appId;

    // Store the app ID and owner credentials for all tests to use
    process.env.BRIDGE_TEST_APP_ID = result.appId;
    process.env.BRIDGE_TEST_OWNER_EMAIL = result.email;
    process.env.BRIDGE_TEST_OWNER_PASSWORD = ownerPassword;

    console.log(`[global-setup] Test app ready:`);
    console.log(`[global-setup]   App ID: ${result.appId}`);
    console.log(`[global-setup]   Domain: ${result.domain}`);
    console.log(`[global-setup]   Owner: ${result.email}`);
  } catch (error: any) {
    throw new Error(
      `Failed to fetch test app. Is bridge-api running?\n` +
        `Error: ${error.message}`,
    );
  }

  // 3. Set app ID via the ConfigStatus UI and save storage state for all tests
  const baseURL = process.env.LOCAL_BASE_URL || 'http://localhost:3001';
  console.log(`[global-setup] Setting app ID via ConfigStatus UI at ${baseURL}...`);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(baseURL);

    // Wait for ConfigStatus to show the app ID in success state (clickable code element)
    const appIdCode = page.locator('code[title="Click to change"]');
    await appIdCode.waitFor({ timeout: 15_000 });

    // Click the app ID to enter edit mode
    await appIdCode.click();

    // Fill in the app ID from the test API
    const input = page.locator('form').getByRole('textbox');
    await input.waitFor({ timeout: 5_000 });
    await input.fill(appId);

    // Click "Save & reload" — triggers localStorage.setItem then location.reload()
    await Promise.all([
      page.waitForLoadState('domcontentloaded'),
      page.getByRole('button', { name: 'Save & reload' }).click(),
    ]);

    // Wait for ConfigStatus to reappear after reload (confirms app is initialized with new ID)
    await page.locator('code[title="Click to change"]').waitFor({ timeout: 15_000 });

    console.log(`[global-setup] App ID ${appId} set via UI`);

    // Save the storage state (contains bridge:appId in localStorage) for all tests to inherit
    const authDir = path.resolve(__dirname, '.auth');
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

    const baseStatePath = path.resolve(authDir, 'base-state.json');
    await context.storageState({ path: baseStatePath });
    console.log(`[global-setup] Storage state saved to ${baseStatePath}`);
  } catch (error: any) {
    throw new Error(
      `Failed to set app ID via UI at ${baseURL}.\n` +
        `Is the demo app running and is VITE_BRIDGE_APP_ID set?\n` +
        `Error: ${error.message}`,
    );
  } finally {
    await browser.close();
  }

  // 4. Purge stale test accounts from previous runs
  try {
    const purgedCount = await testDataClient.purgeTestAccounts();
    console.log(`[global-setup] Purged ${purgedCount} stale test account(s)`);
  } catch (error: any) {
    console.warn(`[global-setup] Warning: Failed to purge test accounts: ${error.message}`);
  }

  console.log('\n[global-setup] Setup complete\n');
}

export default globalSetup;
