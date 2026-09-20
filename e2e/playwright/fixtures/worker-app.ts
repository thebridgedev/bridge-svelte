/**
 * Per-worker Bridge apps — the thing that makes this suite parallel-safe (TBP-604).
 *
 * `paymentsAutoRedirect`, `stripeEnabled` and the SSO flags are **app-level**
 * settings. While every worker drove the same Bridge app, any test that wrote
 * one of them was writing a value every other worker could read — so
 * `welcome-paywall.spec.ts` could set `paymentsAutoRedirect: true`, have a
 * sibling worker set it back to `false` a few hundred milliseconds later, and
 * fail on its own read-back. Spec-level tagging could not fix that, because the
 * `testUser` fixture itself wrote `stripeEnabled: false` on *every* test: the
 * mere act of another test starting up disabled Stripe underneath a running
 * Stripe flow.
 *
 * The fix is to stop sharing the app. `global-setup.ts` provisions one Bridge
 * app per Playwright worker (idempotent, by domain — they persist and are
 * reused across runs) and writes this manifest plus one storage-state file per
 * worker carrying that app's id as `bridge:appId`. Fixtures here resolve the
 * app belonging to the current worker, so an app-level write is only ever
 * observable by the worker that made it — and within a worker, tests run
 * serially, so there is no lost update to lose.
 *
 * Worker 0 deliberately keeps the *unsuffixed* domain, so a `--workers=1` run
 * targets exactly the app this suite always used.
 */

import * as fs from 'fs';
import * as path from 'path';

/** One worker's dedicated Bridge app, as written by global-setup. */
export interface WorkerApp {
  /** Playwright's `parallelIndex` for the worker this app belongs to. */
  parallelIndex: number;
  appId: string;
  appDomain: string;
  ownerEmail: string;
  /** Storage-state file seeding `bridge:appId` for this app. */
  storageStatePath: string;
}

const AUTH_DIR = path.resolve(__dirname, '../.auth');

/** Where global-setup records the provisioned per-worker apps. */
export const WORKER_APPS_MANIFEST = path.resolve(AUTH_DIR, 'worker-apps.json');

/**
 * The app domain for a worker. Worker 0 keeps the base domain unchanged so a
 * single-worker run is byte-for-byte the setup this suite had before TBP-604.
 */
export function workerAppDomain(baseDomain: string, parallelIndex: number): string {
  return parallelIndex === 0 ? baseDomain : `${baseDomain}_W${parallelIndex}`;
}

/**
 * Owner email for a worker app.
 *
 * Deliberately NOT of the form `iman+playwright-test-…@nebulr.group`: that is
 * exactly the pattern bridge-api's `purge` endpoint matches, so an owner named
 * that way gets deleted by the suite's own account purge.
 */
export function workerAppOwnerEmail(parallelIndex: number): string {
  return `iman+pw-svelte-app-w${parallelIndex}@nebulr.group`;
}

/** Storage-state file for a worker's app id. */
export function workerStorageStatePath(parallelIndex: number): string {
  return path.resolve(AUTH_DIR, `worker-${parallelIndex}-state.json`);
}

/**
 * The worker index Playwright assigned to this process. `parallelIndex` is
 * bounded by the worker count (unlike `workerIndex`, which keeps climbing when
 * a worker is restarted), which is what makes it usable as a pool key.
 */
export function currentParallelIndex(): number {
  const raw = Number(process.env.TEST_PARALLEL_INDEX);
  return Number.isInteger(raw) && raw >= 0 ? raw : 0;
}

let cachedManifest: WorkerApp[] | null = null;

/** Read the manifest global-setup wrote. Cached — it never changes mid-run. */
export function readWorkerApps(): WorkerApp[] {
  if (cachedManifest) return cachedManifest;

  if (!fs.existsSync(WORKER_APPS_MANIFEST)) {
    throw new Error(
      `No per-worker app manifest at ${WORKER_APPS_MANIFEST}.\n` +
        `It is written by e2e/playwright/global-setup.ts — run the suite through ` +
        `one of the package.json scripts (bun run test:e2e / test:e2e:stage / test:e2e:prod) ` +
        `rather than invoking "playwright test" directly.`,
    );
  }

  cachedManifest = JSON.parse(fs.readFileSync(WORKER_APPS_MANIFEST, 'utf8')) as WorkerApp[];
  return cachedManifest;
}

export function writeWorkerApps(apps: WorkerApp[]): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(WORKER_APPS_MANIFEST, JSON.stringify(apps, null, 2));
}

/**
 * The app this worker owns. Falls back to worker 0's app when the pool is
 * smaller than the index asked for (e.g. someone raised `--workers` after
 * global-setup ran) so the suite degrades to the old shared-app behaviour
 * loudly-but-working rather than crashing on an undefined.
 */
export function workerAppFor(parallelIndex: number): WorkerApp {
  const apps = readWorkerApps();
  const app = apps.find((a) => a.parallelIndex === parallelIndex);
  if (app) return app;

  console.warn(
    `[worker-app] No app provisioned for parallelIndex ${parallelIndex} ` +
      `(pool size ${apps.length}) — falling back to worker 0's app. ` +
      `App-level settings are shared again for this worker.`,
  );
  return apps[0];
}

/** The app this process's worker owns. */
export function currentWorkerApp(): WorkerApp {
  return workerAppFor(currentParallelIndex());
}

// ---------------------------------------------------------------------------
// App-config baseline
// ---------------------------------------------------------------------------

/**
 * The app-level state every test is entitled to assume when it starts.
 *
 * This is the state `setup-test-app` leaves a fresh app in, and the state the
 * three specs that flip these flags restore in their own `finally` blocks.
 */
export const BASELINE_APP_CONFIG = {
  paymentsAutoRedirect: false,
  stripeEnabled: false,
  googleSsoEnabled: false,
} as const;

type AppConfigPatch = Record<string, unknown>;

/**
 * True when a `configureApp` payload only restates the baseline — i.e. it is a
 * spec's own cleanup, and leaves nothing for the next test to undo.
 */
export function isBaselineConfig(config: AppConfigPatch): boolean {
  const entries = Object.entries(config);
  if (entries.length === 0) return true;
  return entries.every(
    ([key, value]) => (BASELINE_APP_CONFIG as AppConfigPatch)[key] === value,
  );
}

/**
 * Whether this worker's app has been moved off the baseline by a test.
 *
 * Module state, so it is per worker process — which is the same granularity as
 * the app itself now that each worker has its own.
 */
let appConfigDirty = false;

export function markAppConfigDirty(): void {
  appConfigDirty = true;
}

/** Reads and clears the flag. */
export function takeAppConfigDirty(): boolean {
  const dirty = appConfigDirty;
  appConfigDirty = false;
  return dirty;
}
