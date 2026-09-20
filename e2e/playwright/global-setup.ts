/**
 * Global setup for bridge-svelte Playwright E2E tests.
 *
 * Runs once before all tests (after the demo app is already started).
 *
 * ## One Bridge app per worker (TBP-604)
 *
 * `paymentsAutoRedirect`, `stripeEnabled` and the SSO flags live on the **app**,
 * not the tenant. With every worker pointed at one shared app, a test that wrote
 * one of them wrote a value every other worker could read, and the suite raced
 * itself. So this file provisions one app per Playwright worker — idempotent by
 * domain, reused across runs — and writes:
 *
 *   - `.auth/worker-apps.json`       the manifest fixtures resolve their app from
 *   - `.auth/worker-<i>-state.json`  storage state seeding that app's `bridge:appId`
 *
 * Worker 0 keeps the unsuffixed domain, so `--workers=1` targets exactly the app
 * this suite has always used.
 *
 * ## App id resolution (TBP-606)
 *
 * The app id is resolved HERE, from the test-data API, and seeded straight into
 * the browser context's localStorage (`bridge:appId`, which `demo/src/routes/+layout.ts`
 * prefers over `VITE_BRIDGE_APP_ID`). That makes the suite independent of whether
 * `demo/.env.test.<mode>` happens to carry an app id — it does not on a clean
 * checkout, because those files are generated per environment, and a missing or
 * empty `VITE_BRIDGE_APP_ID` used to surface as a locator timeout two layers away.
 *
 * Steps:
 * 1. Validate required environment variables
 * 2. Provision one app per worker (or honour an explicit VITE_BRIDGE_APP_ID pin)
 * 3. Write the manifest + per-worker storage states
 * 4. Load the demo with worker 0's app id and verify Bridge initialized with it
 * 5. Warm the reusable paywall plan on each app, and purge stale test accounts
 */

import { chromium, type FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  BASELINE_APP_CONFIG,
  workerAppDomain,
  workerAppOwnerEmail,
  workerStorageStatePath,
  writeWorkerApps,
  type WorkerApp,
} from './fixtures/worker-app';
import { getCurrentEnvironment } from './config/environments';
import { PAYWALL_PLAN } from './fixtures/plans';
import { TestDataClient, createTestDataClientFromEnv } from './utils/test-data-client';

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

/** Every demo origin this run might serve from, most-likely first. */
function demoOrigins(baseURL: string): string[] {
  let origins = [...KNOWN_DEMO_ORIGINS];
  try {
    origins = [new URL(baseURL).origin, ...origins];
  } catch {
    // baseURL unparseable — the known origins still cover the normal setups
  }
  return Array.from(new Set(origins));
}

/**
 * Storage state that pins `bridge:appId` on every origin the demo may serve from.
 */
function buildAppIdState(appId: string, baseURL: string): StorageState {
  return {
    cookies: [],
    origins: demoOrigins(baseURL).map((origin) => ({
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

/**
 * A test-data client bound to one worker's app domain.
 *
 * Deliberately NOT built from `getEnvironmentConfig()`: that requires
 * `BRIDGE_TEST_APP_ID`, which does not exist yet at the point this file
 * provisions the apps that define it.
 */
function clientForDomain(appDomain: string): TestDataClient {
  return createTestDataClientFromEnv(appDomain);
}

/**
 * Provision (or re-resolve) one worker's app and write its storage state.
 *
 * `setup-test-app` is idempotent by domain: the first run creates the app with
 * its seeded plans and OAuth config, every later run just refreshes that config.
 */
async function provisionWorkerApp(
  parallelIndex: number,
  opts: {
    baseDomain: string;
    baseName: string;
    ownerPassword: string;
    baseURL: string;
    appIdOverride: string;
  },
): Promise<WorkerApp> {
  const appDomain = workerAppDomain(opts.baseDomain, parallelIndex);
  const ownerEmail =
    parallelIndex === 0
      ? process.env.TEST_OWNER_EMAIL || workerAppOwnerEmail(0)
      : workerAppOwnerEmail(parallelIndex);
  const appName =
    parallelIndex === 0 ? opts.baseName : `${opts.baseName} (worker ${parallelIndex})`;

  let appId = opts.appIdOverride;

  if (!appId) {
    const client = clientForDomain(appDomain);
    const result = await client.setupTestApp(
      appDomain,
      appName,
      ownerEmail,
      opts.ownerPassword,
      opts.baseURL,
    );
    appId = (result.appId || '').trim();

    if (!appId) {
      throw new Error(`setup-test-app returned an empty appId for domain ${appDomain}`);
    }

    // The demo is served from both 3001 (Vite) and 3008 (Docker) depending on
    // how the run was started, and `setup-test-app` only derives OAuth config
    // from the single `appUrl` it was given. Widen it so the hosted-portal
    // round-trip works from whichever port this run actually uses.
    await client
      .configureApp({
        allowedOrigins: ['http://localhost:*'],
        redirectUris: demoOrigins(opts.baseURL).map((o) => `${o}/auth/oauth-callback`),
        defaultCallbackUri: `${new URL(opts.baseURL).origin}/auth/oauth-callback`,
        ...BASELINE_APP_CONFIG,
      })
      .catch((error: Error) => {
        console.warn(`[global-setup] ${appDomain}: could not widen OAuth config: ${error.message}`);
      });
  }

  const storageStatePath = workerStorageStatePath(parallelIndex);
  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
  fs.writeFileSync(
    storageStatePath,
    JSON.stringify(buildAppIdState(appId, opts.baseURL), null, 2),
  );

  return { parallelIndex, appId, appDomain, ownerEmail, storageStatePath };
}

/**
 * Create the stable paywall plan (and its Stripe price) on an app ahead of the
 * run, so `welcome-paywall.spec.ts` never has to create-then-immediately-check-out
 * against a price bridge-api is still syncing. Idempotent: on every run after the
 * first, `ensure-plan` returns the existing plan without re-running the sync.
 */
async function warmPaywallPlan(app: WorkerApp): Promise<void> {
  const pk = process.env.STRIPE_TEST_PK || '';
  const sk = process.env.STRIPE_TEST_SK || '';
  if (!pk || !sk) return; // welcome-paywall skips itself without these

  const client = clientForDomain(app.appDomain);
  try {
    await client.configureApp({
      stripeEnabled: true,
      stripePublicKey: pk,
      stripeSecretKey: sk,
      currency: PAYWALL_PLAN.currency,
    });
    const result = await client.ensurePlan(PAYWALL_PLAN.definition);
    if (result.created) {
      console.log(`[global-setup] ${app.appDomain}: created paywall plan ${PAYWALL_PLAN.key}`);
    }
  } catch (error: any) {
    console.warn(
      `[global-setup] ${app.appDomain}: paywall plan warm-up failed (${error.message}) — ` +
        `welcome-paywall will provision it itself.`,
    );
  } finally {
    // Leave the app on the baseline every test is entitled to assume.
    await client.configureApp({ ...BASELINE_APP_CONFIG }).catch(() => {});
  }
}

async function globalSetup(config: FullConfig) {
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

  const envFile = demoEnvFileForProject();
  const baseDomain = process.env.TEST_APP_DOMAIN || 'BRIDGE_SVELTE_TEST_DASHBOARD';
  const baseName = process.env.TEST_APP_NAME || 'Bridge Svelte Test Dashboard';
  const ownerPassword = process.env.TEST_OWNER_PASSWORD || 'helloworld';
  const baseURL = process.env.LOCAL_BASE_URL || 'http://localhost:3001';

  // An explicit VITE_BRIDGE_APP_ID (exported, or read from the demo env file by the
  // caller) still wins — it is the documented escape hatch for pinning an app id.
  // It pins EVERY worker to that one app, which reinstates the shared-app race
  // TBP-604 removed, so say so out loud.
  const appIdOverride = (process.env.VITE_BRIDGE_APP_ID || '').trim();

  // 2. Provision one app per worker. `config.workers` is the resolved count for
  //    this run, so `--workers N` sizes the pool automatically.
  const workerCount = Math.max(1, config.workers || 1);

  if (appIdOverride) {
    console.log(
      `[global-setup] VITE_BRIDGE_APP_ID=${appIdOverride} pins all ${workerCount} worker(s) ` +
        `to one app — app-level settings are shared again for this run.`,
    );
  } else {
    console.log(
      `[global-setup] Provisioning ${workerCount} worker app(s) from base domain ${baseDomain}...`,
    );
  }

  let workerApps: WorkerApp[];
  try {
    workerApps = await Promise.all(
      Array.from({ length: workerCount }, (_, i) =>
        provisionWorkerApp(i, { baseDomain, baseName, ownerPassword, baseURL, appIdOverride }),
      ),
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not provision the per-worker Bridge apps for this run.\n` +
        `The test-data API failed with: ${message}\n\n` +
        `Fix one of these:\n` +
        `  • Make the test-data API reachable — check STAGE_TEST_DATA_API_URL / PROD_TEST_DATA_API_URL / ` +
        `LOCAL_TEST_DATA_API_URL and PLAYWRIGHT_TEST_API_KEY in config/.env.test.local\n` +
        `  • Or pin an app id: set VITE_BRIDGE_APP_ID in ${envFile} (or export it for this run)`,
    );
  }

  writeWorkerApps(workerApps);
  for (const app of workerApps) {
    console.log(
      `[global-setup]   worker ${app.parallelIndex}: ${app.appDomain} → ${app.appId}`,
    );
  }

  // Worker 0's app is the one the demo is booted with below, and the one any
  // code reading BRIDGE_TEST_APP_ID (e.g. getEnvironmentConfig's required-var
  // check) falls back to. Worker processes inherit this env.
  const primary = workerApps[0];
  process.env.BRIDGE_TEST_APP_ID = primary.appId;
  process.env.BRIDGE_TEST_OWNER_EMAIL = primary.ownerEmail;
  process.env.BRIDGE_TEST_OWNER_PASSWORD = ownerPassword;

  // 3. Load the demo with worker 0's app id and verify it initializes with it.
  console.log(
    `[global-setup] Seeding ${APP_ID_STORAGE_KEY}=${primary.appId} and loading demo at ${baseURL}...`,
  );

  const browser = await chromium.launch();
  const context = await browser.newContext({
    storageState: buildAppIdState(primary.appId, baseURL),
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
        `The demo at ${baseURL} did not initialize Bridge with app id ${primary.appId}.\n` +
          (demoMessage ? `Demo reported: ${demoMessage.replace(/\s+/g, ' ').trim()}\n` : '') +
          `The app id was seeded into localStorage as "${APP_ID_STORAGE_KEY}"; ` +
          `if the demo ignored it, set VITE_BRIDGE_APP_ID in ${envFile} and re-run.\n` +
          `Underlying wait: ${waitError instanceof Error ? waitError.message : String(waitError)}`,
      );
    }

    const shownAppId = (await appIdCode.innerText()).trim();
    if (shownAppId !== primary.appId) {
      throw new Error(
        `The demo at ${baseURL} initialized with app id ${shownAppId}, expected ${primary.appId}.\n` +
          `Something else is pinning the app id — check VITE_BRIDGE_APP_ID in ${envFile} ` +
          `and any exported VITE_BRIDGE_APP_ID.`,
      );
    }

    console.log(`[global-setup] Demo initialized with app id ${primary.appId}`);

    // The demo has to be serving the SAME environment this run targets. It is
    // not guaranteed to: `playwright.config.ts` reuses a Docker demo already
    // answering on :3008 for any project, and that container is normally left
    // running `--mode test.local`. The suite then drives the browser at the
    // LOCAL bridge-api while the test-data client provisions apps on stage —
    // a run that reports numbers for a backend nobody asked about. The app-id
    // check above does not catch it, because the id is seeded through
    // localStorage and is correct either way (TBP-607).
    const expectedEnv = getCurrentEnvironment();
    const envPill = page.locator('.env-pill');
    const shownEnv = await envPill
      .first()
      .getAttribute('data-env')
      .catch(() => null);

    if (shownEnv !== expectedEnv) {
      throw new Error(
        `The demo at ${baseURL} is serving the "${shownEnv ?? 'unknown'}" environment, ` +
          `but this run targets "${expectedEnv}".\n` +
          `Vite picks the environment from its --mode flag, so the demo must run ` +
          `\`vite dev --mode test.${expectedEnv}\` (which loads ${envFile}).\n` +
          `If you are reusing the Docker demo on :3008, restart its vite process with that mode:\n` +
          `  docker exec bridge-svelte pkill -f 'vite dev'\n` +
          `  docker exec -d bridge-svelte bash -lc "cd /home/bridgeuser/app/demo && bunx vite dev --mode test.${expectedEnv}"`,
      );
    }
    console.log(`[global-setup] Demo is serving the "${shownEnv}" environment`);

    // Refresh worker 0's storage state from the context Playwright just captured,
    // and keep `base-state.json` (the config-level default, used by anything that
    // has not opted into the per-worker fixtures) pointing at the same app.
    const captured = (await context.storageState()) as StorageState;
    const merged = withAppIdOnAllOrigins(captured, primary.appId, baseURL);
    fs.writeFileSync(primary.storageStatePath, JSON.stringify(merged, null, 2));

    const baseStatePath = path.resolve(path.dirname(primary.storageStatePath), 'base-state.json');
    fs.writeFileSync(baseStatePath, JSON.stringify(merged, null, 2));
    console.log(`[global-setup] Storage state saved to ${baseStatePath}`);
  } finally {
    await browser.close();
  }

  // 4. Warm the reusable paywall plan and purge stale accounts, per app.
  //    Serial on purpose: the Stripe price sync behind `ensure-plan` is rate
  //    limited per Stripe account, and this is a once-per-run cost anyway.
  for (const app of workerApps) {
    await warmPaywallPlan(app);
  }

  const purgeTargets = appIdOverride ? workerApps.slice(0, 1) : workerApps;
  await Promise.all(
    purgeTargets.map(async (app) => {
      try {
        const purgedCount = await clientForDomain(app.appDomain).purgeTestAccounts();
        if (purgedCount > 0) {
          console.log(
            `[global-setup] ${app.appDomain}: purged ${purgedCount} stale test account(s)`,
          );
        }
      } catch (error: any) {
        console.warn(
          `[global-setup] ${app.appDomain}: failed to purge test accounts: ${error.message}`,
        );
      }
    }),
  );

  console.log('\n[global-setup] Setup complete\n');
}

export default globalSetup;
