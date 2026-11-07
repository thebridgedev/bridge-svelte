import { defineConfig, devices } from '@playwright/test';

/**
 * The demo's Playwright suite.
 *
 * By default it starts a local issuer (auth-core's fake issuer over HTTP,
 * e2e/harness/fake-issuer.ts) and the demo pointed at it. Point it at a real
 * issuer, a local bridge-server or stage, with:
 *
 *   E2E_ISSUER=https://…/identity-access/apps/<app id>   the issuer the demo uses
 *   E2E_BASE_URL=http://localhost:3001                    a demo already running (else one is started)
 *
 * Tests run one at a time: the local issuer's flags and plans are shared by
 * every test, and each test starts from a reset.
 */
const FAKE_PORT = Number(process.env.FAKE_ISSUER_PORT ?? 4400);
const external = process.env.E2E_ISSUER;
const issuer = external ?? `http://localhost:${FAKE_PORT}/identity-access/apps/app-demo`;
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3001';

process.env.E2E_ISSUER_RESOLVED = issuer;
process.env.E2E_FAKE_CONTROL = external ? '' : `http://localhost:${FAKE_PORT}/__test`;

export default defineConfig({
	testDir: './e2e/playwright/tests',
	timeout: 60_000,
	expect: { timeout: 10_000 },
	fullyParallel: false,
	workers: 1,
	retries: 0,
	forbidOnly: !!process.env.CI,
	reporter: [['list'], ['html', { outputFolder: 'test-reports/playwright-report', open: 'never' }]],
	use: {
		baseURL,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: [
		...(external
			? []
			: [
					{
						command: 'bun e2e/harness/fake-issuer.ts',
						url: `http://localhost:${FAKE_PORT}/identity-access/apps/app-demo/.well-known/openid-configuration`,
						reuseExistingServer: true,
						timeout: 30_000,
					},
				]),
		...(process.env.E2E_BASE_URL
			? []
			: [
					{
						command: 'bun run dev',
						cwd: 'demo',
						url: baseURL,
						env: { PUBLIC_BRIDGE_ISSUER: issuer },
						reuseExistingServer: true,
						timeout: 120_000,
					},
				]),
	],
});
