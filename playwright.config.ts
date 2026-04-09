import { defineConfig, devices } from '@playwright/test';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from config/.env.test.local
// Use override: false so CLI/env vars take precedence over .env file values
dotenv.config({
  path: path.resolve(__dirname, 'config/.env.test.local'),
  override: false,
});

// Auto-detect Docker demo: if the demo is already running in Docker on port 3008,
// use it instead of starting a new Vite dev server on port 3001.
const DOCKER_DEMO_URL = 'http://localhost:3008';
if (!process.env.LOCAL_BASE_URL && !process.env.WEB_SERVER_URL) {
  try {
    execSync(`curl -s -o /dev/null --max-time 2 ${DOCKER_DEMO_URL}`, { stdio: 'pipe' });
    process.env.LOCAL_BASE_URL = DOCKER_DEMO_URL;
    process.env.WEB_SERVER_URL = DOCKER_DEMO_URL;
  } catch {
    // Docker demo not running — fall back to Vite auto-start on port 3001
  }
}

/**
 * Determine the Vite mode for the demo app based on the Playwright project.
 * This controls which demo/.env.test.{mode} file Vite loads.
 *
 *   --project=local      →  vite dev --mode test.local   →  demo/.env.test.local
 *   --project=stage      →  vite dev --mode test.stage   →  demo/.env.test.stage
 *   --project=prod       →  vite dev --mode test.prod    →  demo/.env.test.prod
 */
function getViteMode(): string {
  const project = process.env.PLAYWRIGHT_PROJECT_NAME || '';
  if (project.includes('prod')) return 'test.prod';
  if (project.includes('stage')) return 'test.stage';
  return 'test.local';
}

/**
 * Playwright configuration for bridge-svelte E2E tests.
 *
 * Tests run against the demo app which integrates bridge-svelte.
 * The demo app is started automatically via webServer config.
 *
 * Usage:
 *   bunx playwright test --project=local
 *   bunx playwright test --project=stage
 *   bunx playwright test --project=prod
 */
export default defineConfig({
  // Test directory
  testDir: './e2e/playwright/tests',

  // Maximum time one test can run
  timeout: 60 * 1000,

  // Maximum time expect() should wait for condition
  expect: {
    timeout: 10 * 1000,
  },

  // Run tests sequentially — E2E tests against shared backends should not run in parallel
  fullyParallel: false,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retries disabled — fix flaky tests instead of retrying them
  retries: 0,

  // Use 1 worker in CI to avoid shared-state race conditions
  workers: process.env.CI ? 1 : undefined,

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'test-reports/playwright-report' }],
    ['json', { outputFile: 'test-reports/playwright-results.json' }],
    ['list'],
  ],

  // Shared settings for all projects
  use: {
    // The demo app always runs locally regardless of which Bridge backend it targets
    // Port 3001 when started directly via Vite, port 3008 when running in Docker
    baseURL: process.env.LOCAL_BASE_URL || 'http://localhost:3001',

    // Base storage state: contains only the E2E app ID in localStorage.
    // Written by pre-setup.ts before Playwright starts.
    storageState: path.resolve(__dirname, 'e2e/playwright/.auth/base-state.json'),

    // Recording: keep artifacts on failure by default, all if PLAYWRIGHT_RECORD_ALL=true
    trace: process.env.PLAYWRIGHT_RECORD_ALL === 'true' ? 'on' : 'retain-on-failure',
    screenshot: process.env.PLAYWRIGHT_RECORD_ALL === 'true' ? 'on' : 'only-on-failure',
    video: process.env.PLAYWRIGHT_RECORD_ALL === 'true' ? 'on' : 'retain-on-failure',

    // Headed mode via env var
    headless: process.env.PLAYWRIGHT_HEADED !== 'true',
  },

  // Projects select which Bridge backend the demo app talks to.
  // The demo app URL is always the same (localhost) — only the
  // app ID and Bridge service endpoints change per environment.
  projects: [
    // =====================================================
    // Local Environment — demo app talks to local bridge-api
    // =====================================================
    {
      name: 'local',
      use: { ...devices['Desktop Chrome'] },
    },

    // =====================================================
    // Local No Auth — for login flow tests (no stored auth state)
    // =====================================================
    {
      name: 'local-no-auth',
      use: { ...devices['Desktop Chrome'] },
    },

    // =====================================================
    // Stage — demo app talks to staging Bridge backend
    // =====================================================
    {
      name: 'stage',
      use: { ...devices['Desktop Chrome'] },
    },

    // =====================================================
    // Production — demo app talks to prod Bridge (opt-in)
    // =====================================================
    {
      name: 'prod',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Output folder for test artifacts
  outputDir: 'test-reports/test-results',

  // Start the demo app automatically before tests.
  // Vite's --mode flag loads the matching env file: demo/.env.test.{local|stage|prod}
  // WEB_SERVER_URL can override the default to reuse a Docker-hosted demo (e.g. localhost:3008)
  webServer: {
    command: `cd demo && bunx vite dev --mode ${getViteMode()}`,
    url: process.env.WEB_SERVER_URL || 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },

  // Global setup — runs once before all tests
  globalSetup: require.resolve('./e2e/playwright/global-setup'),
});
