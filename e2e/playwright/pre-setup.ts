/**
 * Pre-setup script for bridge-svelte E2E tests.
 *
 * Runs BEFORE Playwright starts to:
 * 1. Create or get the persistent test app (idempotent)
 * 2. Write the app ID into the demo env file so the demo app starts with it
 *
 * This solves the chicken-and-egg problem: the demo app needs VITE_BRIDGE_APP_ID
 * at startup, but the app ID is only known after calling the test data API.
 *
 * Usage: bun run e2e/playwright/pre-setup.ts [mode]
 *   mode: test.local (default), test.stage, test.prod
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load test env vars
const rootDir = path.resolve(__dirname, '../..');
dotenv.config({
  path: path.resolve(rootDir, 'config/.env.test.local'),
  override: false,
});

async function preSetup() {
  const mode = process.argv[2] || 'test.local';
  const envFile = path.resolve(rootDir, `demo/.env.${mode}`);

  console.log(`[pre-setup] Mode: ${mode}`);
  console.log(`[pre-setup] Demo env file: ${envFile}`);

  // Validate required env vars
  if (!process.env.PLAYWRIGHT_TEST_API_KEY) {
    throw new Error(
      'PLAYWRIGHT_TEST_API_KEY is not set.\n' +
        'Copy config/.env.test.local.example to config/.env.test.local and fill in the values.',
    );
  }

  // Determine test data API URL based on mode
  let testDataApiUrl: string;
  if (mode.includes('prod')) {
    testDataApiUrl = process.env.PROD_TEST_DATA_API_URL || '';
    if (!testDataApiUrl) throw new Error('PROD_TEST_DATA_API_URL is required for prod mode');
  } else if (mode.includes('stage')) {
    testDataApiUrl = process.env.STAGE_TEST_DATA_API_URL || '';
    if (!testDataApiUrl) throw new Error('STAGE_TEST_DATA_API_URL is required for stage mode');
  } else {
    testDataApiUrl = process.env.LOCAL_TEST_DATA_API_URL || 'http://localhost:3200';
  }

  const apiKey = process.env.PLAYWRIGHT_TEST_API_KEY;
  const testAppDomain = process.env.TEST_APP_DOMAIN || 'BRIDGE_SVELTE_TEST_DASHBOARD';
  const testAppName = process.env.TEST_APP_NAME || 'Bridge Svelte Test Dashboard';
  const ownerEmail = process.env.TEST_OWNER_EMAIL || 'playwright-e2e@thebridge.io';
  const ownerPassword = process.env.TEST_OWNER_PASSWORD || 'helloworld';

  // Health check
  console.log(`[pre-setup] Health-checking test data API at ${testDataApiUrl}...`);
  const healthRes = await fetch(`${testDataApiUrl}/account/test/playwright/health`, {
    method: 'GET',
    headers: { 'x-playwright-api-key': apiKey },
  });

  if (!healthRes.ok) {
    throw new Error(
      `Test data API health check failed (${healthRes.status}). Is bridge-api running?`,
    );
  }
  console.log(`[pre-setup] Health check passed`);

  // Create or get the test app
  console.log(`[pre-setup] Setting up test app (domain: ${testAppDomain})...`);
  const setupRes = await fetch(`${testDataApiUrl}/account/test/playwright/setup-test-app`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-playwright-api-key': apiKey,
    },
    body: JSON.stringify({
      domain: testAppDomain,
      appName: testAppName,
      ownerEmail,
      ownerPassword,
      appUrl: 'http://localhost:3001',
    }),
  });

  if (!setupRes.ok) {
    const error = await setupRes.text();
    throw new Error(`Failed to setup test app: ${setupRes.status} ${error}`);
  }

  const result = await setupRes.json();
  const appId = result.appId;

  console.log(`[pre-setup] Test app ready:`);
  console.log(`[pre-setup]   App ID: ${appId}`);
  console.log(`[pre-setup]   Domain: ${result.domain}`);
  console.log(`[pre-setup]   Owner: ${result.email}`);

  // Write the app ID into the demo env file
  if (!fs.existsSync(envFile)) {
    throw new Error(`Demo env file not found: ${envFile}`);
  }

  let envContent = fs.readFileSync(envFile, 'utf-8');

  // Replace VITE_BRIDGE_APP_ID= (with any existing value or empty)
  envContent = envContent.replace(
    /^VITE_BRIDGE_APP_ID=.*$/m,
    `VITE_BRIDGE_APP_ID=${appId}`,
  );

  fs.writeFileSync(envFile, envContent);
  console.log(`[pre-setup] Updated ${envFile} with VITE_BRIDGE_APP_ID=${appId}`);

  // Also export for the current process (used by global-setup.ts)
  console.log(`\n[pre-setup] Done. Demo app will start with the correct app ID.\n`);
}

preSetup().catch((err) => {
  console.error(`[pre-setup] Fatal error: ${err.message}`);
  process.exit(1);
});
