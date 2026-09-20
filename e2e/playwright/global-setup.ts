/**
 * Global setup for bridge-svelte Playwright E2E tests.
 *
 * Runs once before all tests (after the demo app is already started).
 *
 * The app id is resolved HERE, from the test-data API, and seeded straight into
 * the browser context's localStorage (`bridge:appId`, which `demo/src/routes/+layout.ts`
 * prefers over `VITE_BRIDGE_APP_ID`). That makes the suite independent of whether
 * `demo/.env.test.<mode>` happens to carry an app id — it does not on a clean
 * checkout, because those files are generated per environment, and a missing or
 * empty `VITE_BRIDGE_APP_ID` used to surface as a locator timeout two layers away
 * (TBP-606).
 *
 * Steps:
 * 1. Validate required environment variables
 * 2. Resolve the app id (test-data API, or an explicit VITE_BRIDGE_APP_ID override)
 * 3. Seed it into localStorage, load the demo, and verify Bridge initialized with it
 * 4. Save the storage state to base-state.json for all tests to inherit
 * 5. Purge stale playwright test accounts
 *
 * Pattern borrowed from bridge-api/e2e/playwright/global-setup.ts
 */

import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { createTestDataClientFromEnv } from './utils/test-data-client';

/**
 * Demo origins the app id is seeded into. The demo answers on 3001 when
 * Playwright starts Vite itself and on 3008 when it reuses the Docker demo,
 * so both are seeded and either can be the one tests actually hit.
 */
const KNOWN_DEMO_ORIGINS = ['http://localhost:3001', 'http://localhost:3008'];

const APP_ID_STORAGE_KEY = 'bridge:appId';

type StorageState = {
  // Playwright's own cookie shape; opaque here — global-setup never reads it.
  cookies: any[];
  origins: { origin: string; localStorage: { name: string; value: string }[] }[];
};

/**
 * The demo env file backing the current Playwright project. Named in failures so
 * the message points at the setting a human can actually change.
 */
function demoEnvFileForProject(): string {
  const project = process.env.PLAYWRIGHT_PROJECT_NAME || '';
  if (project.includes('prod')) return 'demo/.env.test.prod';
  if (project.includes('stage')) return 'demo/.env.test.stage';
  return 'demo/.env.test.local';
}

/**
 * Storage state that pins `bridge:appId` on every origin the demo may serve from.
 */
function buildAppIdState(appId: string, baseURL: string): StorageState {
  let origins = [...KNOWN_DEMO_ORIGINS];
  try {
    origins = [new URL(baseURL).origin, ...origins];
  } catch {
    // baseURL unparseable — the known origins still cover the normal setups
  }

  return {
    cookies: [],
    origins: Array.from(new Set(origins)).map((origin) => ({
      origin,
      localStorage: [{ name: APP_ID_STORAGE_KEY, value: appId }],
    })),
  };
}

/**
 * Make sure the state Playwright captured still carries the app id for every
 * known demo origin — `context.storageState()` only reports origins the context
 * actually visited, and tests may hit the other port.
 */
function withAppIdOnAllOrigins(state: StorageState, appId: string, baseURL: string): StorageState {
  const seeded = buildAppIdState(appId, baseURL);
  const origins = [...(state.origins ?? [])];

  for (const seededOrigin of seeded.origins) {
    const existing = origins.find((o) => o.origin === seededOrigin.origin);
    if (!existing) {
      origins.push(seededOrigin);
      continue;
    }
    const entries = existing.localStorage ?? [];
    const appIdEntry = entries.find((e) => e.name === APP_ID_STORAGE_KEY);
    if (appIdEntry) {
      appIdEntry.value = appId;
    } else {
      entries.push({ name: APP_ID_STORAGE_KEY, value: appId });
    }
    existing.localStorage = entries;
  }

  return { cookies: state.cookies ?? [], origins };
}

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

  // 2. Resolve the app id for this run.
  const testDataClient = createTestDataClientFromEnv();
  const envFile = demoEnvFileForProject();

  const testAppDomain = process.env.TEST_APP_DOMAIN || 'BRIDGE_SVELTE_TEST_DASHBOARD';
  const testAppName = process.env.TEST_APP_NAME || 'Bridge Svelte Test Dashboard';
  const ownerEmail = process.env.TEST_OWNER_EMAIL || 'iman+playwright-test-owner@nebulr.group';
  const ownerPassword = process.env.TEST_OWNER_PASSWORD || 'helloworld';

  // An explicit VITE_BRIDGE_APP_ID (exported, or read from the demo env file by the
  // caller) still wins — it is the documented escape hatch for pinning an app id.
  const appIdOverride = (process.env.VITE_BRIDGE_APP_ID || '').trim();

  console.log(`[global-setup] Fetching test app (domain: ${testAppDomain})...`);

  let appId = '';
  let resolveError: Error | null = null;

  try {
    const appUrl = process.env.LOCAL_BASE_URL || 'http://localhost:3001';
    const result = await testDataClient.setupTestApp(
      testAppDomain,
      testAppName,
      ownerEmail,
      ownerPassword,
      appUrl,
    );

    appId = (result.appId || '').trim();

    // Store the owner credentials for all tests to use
    process.env.BRIDGE_TEST_OWNER_EMAIL = result.email;
    process.env.BRIDGE_TEST_OWNER_PASSWORD = ownerPassword;

    console.log(`[global-setup] Test app ready:`);
    console.log(`[global-setup]   App ID: ${result.appId}`);
    console.log(`[global-setup]   Domain: ${result.domain}`);
    console.log(`[global-setup]   Owner: ${result.email}`);
  } catch (error: unknown) {
    resolveError = error instanceof Error ? error : new Error(String(error));
    console.warn(`[global-setup] Test-data API could not provide an app id: ${resolveError.message}`);
  }

  if (appIdOverride) {
    if (appId && appIdOverride !== appId) {
      console.log(
        `[global-setup] VITE_BRIDGE_APP_ID=${appIdOverride} overrides the test-data app id ${appId}`,
      );
    }
    appId = appIdOverride;
    process.env.BRIDGE_TEST_OWNER_EMAIL ??= ownerEmail;
    process.env.BRIDGE_TEST_OWNER_PASSWORD ??= ownerPassword;
  }

  if (!appId) {
    throw new Error(
      `Could not resolve a Bridge app id for this run.\n` +
        `Tried the test-data API (domain: ${testAppDomain})` +
        (resolveError ? ` — it failed with: ${resolveError.message}` : ` — it returned an empty appId.`) +
        `\n\n` +
        `Fix one of these:\n` +
        `  • Make the test-data API reachable — check STAGE_TEST_DATA_API_URL / PROD_TEST_DATA_API_URL / ` +
        `LOCAL_TEST_DATA_API_URL and PLAYWRIGHT_TEST_API_KEY in config/.env.test.local\n` +
        `  • Or pin an app id: set VITE_BRIDGE_APP_ID in ${envFile} (or export it for this run)`,
    );
  }

  process.env.BRIDGE_TEST_APP_ID = appId;

  // 3. Seed the app id into localStorage and verify the demo initializes with it.
  const baseURL = process.env.LOCAL_BASE_URL || 'http://localhost:3001';
  console.log(`[global-setup] Seeding ${APP_ID_STORAGE_KEY}=${appId} and loading demo at ${baseURL}...`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    storageState: buildAppIdState(appId, baseURL),
  });
  const page = await context.newPage();

  try {
    await page.goto(baseURL);

    // ConfigStatus renders the clickable app id only once Bridge config initialized.
    const appIdCode = page.locator('code[title="Click to change"]');

    try {
      await appIdCode.waitFor({ timeout: 15_000 });
    } catch (waitError: unknown) {
      // Report what the demo itself says rather than the locator that timed out.
      const demoMessage = await page
        .locator('.feature-status')
        .first()
        .innerText()
        .catch(() => '');

      throw new Error(
        `The demo at ${baseURL} did not initialize Bridge with app id ${appId}.\n` +
          (demoMessage ? `Demo reported: ${demoMessage.replace(/\s+/g, ' ').trim()}\n` : '') +
          `The app id was seeded into localStorage as "${APP_ID_STORAGE_KEY}"; ` +
          `if the demo ignored it, set VITE_BRIDGE_APP_ID in ${envFile} and re-run.\n` +
          `Underlying wait: ${waitError instanceof Error ? waitError.message : String(waitError)}`,
      );
    }

    const shownAppId = (await appIdCode.innerText()).trim();
    if (shownAppId !== appId) {
      throw new Error(
        `The demo at ${baseURL} initialized with app id ${shownAppId}, expected ${appId}.\n` +
          `Something else is pinning the app id — check VITE_BRIDGE_APP_ID in ${envFile} ` +
          `and any exported VITE_BRIDGE_APP_ID.`,
      );
    }

    console.log(`[global-setup] Demo initialized with app id ${appId}`);

    // Save the storage state for all tests to inherit
    const authDir = path.resolve(__dirname, '.auth');
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

    const captured = (await context.storageState()) as StorageState;
    const baseStatePath = path.resolve(authDir, 'base-state.json');
    fs.writeFileSync(
      baseStatePath,
      JSON.stringify(withAppIdOnAllOrigins(captured, appId, baseURL), null, 2),
    );
    console.log(`[global-setup] Storage state saved to ${baseStatePath}`);
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
