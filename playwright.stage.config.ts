import { defineConfig, devices } from '@playwright/test';
import { readManifest, readRuntime } from './e2e/playwright/support/stage/manifest';

/**
 * The demo's Playwright suite against a real Bridge server (stage), through the
 * stage adapter (e2e/playwright/support/stage/stage-issuer.ts).
 *
 *   E2E_PARITY_MANIFEST   the parity fixture's manifest for the run's Child App
 *   E2E_STAGE_MODE        `embedded` (default): the demo's own sign-in forms, and the memory-storage demo
 *                         `hosted`: sign-in on the page Bridge hosts for the app (tests-stage/)
 *
 * Prepare the run first (`bun e2e/stage/prepare.ts`), then run one mode, then the other:
 * the demo is served at the same address in both, the one the Child App lists.
 * Run it in a container; scripts/stage-e2e.sh does the whole sequence.
 */
const manifest = readManifest();
const runtime = readRuntime();
if (manifest === null || runtime === null) throw new Error('Set E2E_PARITY_MANIFEST and run `bun e2e/stage/prepare.ts` first.');

const hosted = process.env.E2E_STAGE_MODE === 'hosted';
const origin = process.env.E2E_BASE_URL ?? 'http://localhost:3001';
const memoryOrigin = process.env.E2E_MEMORY_BASE_URL ?? 'http://localhost:3002';
const issuer = manifest.app.issuer;
process.env.E2E_ISSUER_RESOLVED = issuer;
process.env.E2E_FAKE_CONTROL = '';

const demo = (port: number, extra: Record<string, string> = {}) => ({
	command: `bun run dev -- --port ${port} --strictPort`,
	cwd: 'demo',
	url: `http://localhost:${port}`,
	env: { PUBLIC_BRIDGE_ISSUER: issuer, BRIDGE_APP_KEY: runtime.appKey, ...extra },
	reuseExistingServer: false,
	timeout: 180_000,
});

export default defineConfig({
	timeout: 120_000,
	expect: { timeout: 20_000 },
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: [['list'], ['json', { outputFile: `test-reports/stage-${hosted ? 'hosted' : 'embedded'}.json` }]],
	use: { baseURL: origin, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
	projects: hosted
		? [{ name: 'hosted', testDir: './e2e/playwright/tests-stage', use: { ...devices['Desktop Chrome'] } }]
		: [
				{ name: 'embedded', testDir: './e2e/playwright/tests', testIgnore: /\/memory\//, use: { ...devices['Desktop Chrome'] } },
				{ name: 'memory', testDir: './e2e/playwright/tests', testMatch: /\/memory\/.*\.spec\.ts$/, use: { ...devices['Desktop Chrome'], baseURL: memoryOrigin } },
			],
	webServer: hosted
		? [demo(Number(new URL(origin).port), { PUBLIC_DEMO_HOSTED: 'true' })]
		: [demo(Number(new URL(origin).port)), demo(Number(new URL(memoryOrigin).port), { PUBLIC_DEMO_STORAGE: 'memory' })],
});
