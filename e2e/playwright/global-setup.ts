/**
 * Global setup for bridge-svelte Playwright E2E tests.
 *
 * Runs once before all tests (after the demo app is already started).
 *
 * The test app was already created by pre-setup.ts (which runs before Playwright).
 * This global setup:
 * 1. Fetches the test app info and stores it in process.env for tests
 * 2. Purges stale playwright test accounts
 *
 * Pattern borrowed from bridge-api/e2e/playwright/global-setup.ts
 */

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

  try {
    const appUrl = process.env.LOCAL_BASE_URL || 'http://localhost:3001';
    const result = await testDataClient.setupTestApp(
      testAppDomain,
      testAppName,
      ownerEmail,
      ownerPassword,
      appUrl,
    );

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

  // 3. Purge stale test accounts from previous runs
  try {
    const purgedCount = await testDataClient.purgeTestAccounts();
    console.log(`[global-setup] Purged ${purgedCount} stale test account(s)`);
  } catch (error: any) {
    console.warn(`[global-setup] Warning: Failed to purge test accounts: ${error.message}`);
  }

  console.log('\n[global-setup] Setup complete\n');
}

export default globalSetup;
