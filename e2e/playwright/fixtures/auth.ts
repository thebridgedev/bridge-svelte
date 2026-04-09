/**
 * Authentication fixtures for bridge-svelte Playwright E2E tests.
 *
 * Provides custom fixtures that inject:
 * - envConfig: environment configuration
 * - testDataClient: TestDataClient for account management
 * - testUser: auto-created test account (cleaned up after)
 * - authenticatedPage: a Page with the test user already logged in
 *
 * Pattern borrowed from bridge-api/e2e/playwright/fixtures/auth.ts
 */

import { test as base, expect, type Page } from '@playwright/test';
import {
  type EnvironmentConfig,
  getCurrentEnvironment,
  getEnvironmentConfig,
} from '../config/environments';
import { type PlaywrightTestAccount, TestDataClient } from '../utils/test-data-client';
import { LONG_TIMEOUT, MED_TIMEOUT } from './timeouts';

/**
 * Extended test fixtures for authentication and test data management.
 */
export interface AuthFixtures {
  /** Test user credentials and IDs */
  testUser: PlaywrightTestAccount;
  /** Pre-authenticated page fixture */
  authenticatedPage: Page;
  /** Environment configuration */
  envConfig: EnvironmentConfig;
  /** Test data client for API calls */
  testDataClient: TestDataClient;
}

/**
 * Extended test with authentication fixtures.
 * Import this instead of '@playwright/test' in your spec files.
 */
export const test = base.extend<AuthFixtures>({
  // Environment configuration
  envConfig: async ({}, use) => {
    const env = getCurrentEnvironment();
    const config = getEnvironmentConfig(env);
    await use(config);
  },

  // Test data client for API operations
  testDataClient: async ({ envConfig }, use) => {
    const client = new TestDataClient(envConfig);
    await use(client);
  },

  // Test user — created before test, cleaned up after
  testUser: async ({ testDataClient }, use) => {
    const account = await testDataClient.createTestAccount();
    console.log(`[fixture] Created test account: ${account.email}`);

    await use(account);

    // Cleanup after test
    try {
      await testDataClient.removeTestAccount(account.email);
      console.log(`[fixture] Removed test account: ${account.email}`);
    } catch (error: any) {
      console.warn(`[fixture] Failed to remove test account ${account.email}: ${error.message}`);
    }
  },

  // Pre-authenticated page — uses SDK auth (direct /auth/login, no redirect)
  authenticatedPage: async ({ page, testUser }, use) => {
    await loginViaSdkAuth(page, testUser.email, testUser.password);
    await use(page);
  },
});

export { expect } from '@playwright/test';

/**
 * Login via the Bridge auth flow.
 *
 * Flow:
 * 1. Navigate to demo app home page
 * 2. Click "Login with Bridge" button
 * 3. Get redirected to bridge cloud-views login page
 * 4. Enter email, click Continue
 * 5. Enter password, click Sign in
 * 6. Handle choose-user/workspace selection if needed
 * 7. Get redirected back to demo app via OAuth callback
 * 8. Wait for tokens to be stored in localStorage
 */
export async function loginViaBridgeAuth(
  page: Page,
  email: string,
  password: string,
  envConfig: EnvironmentConfig,
): Promise<void> {
  console.log(`[login] Starting login for ${email}`);

  // 1. Navigate to demo app home page
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  console.log(`[login] On home page: ${page.url()}`);

  // 2. Click the "Login with Bridge" button
  const loginButton = page.locator('button:has-text("Login with Bridge")');
  await loginButton.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  await loginButton.click();

  // 3. Wait for redirect to bridge auth login page
  await page.waitForURL(
    (url) => {
      const urlString = url.toString();
      return urlString.includes('/auth/') || urlString.includes('/login');
    },
    { timeout: LONG_TIMEOUT },
  );

  console.log(`[login] Redirected to auth page: ${page.url()}`);

  // 4. Enter email (step 1 of two-step login)
  const emailInput = page
    .locator('#email, input[name="username"], input[type="email"]')
    .first();
  await emailInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  await emailInput.fill(email);

  const continueButton = page
    .locator('button[type="submit"]:has-text("Continue")')
    .first();
  await continueButton.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  await continueButton.click();

  // 5. Enter password (step 2)
  const passwordInput = page
    .locator('#password, input[name="password"], input[type="password"]')
    .first();
  await passwordInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  await passwordInput.fill(password);

  const signInButton = page
    .locator('button[type="submit"]:has-text("Sign in")')
    .first();
  await signInButton.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  await signInButton.click();

  console.log(`[login] Submitted credentials, waiting for OAuth flow...`);

  // 6. Wait for redirect away from login page
  try {
    await page.waitForURL(
      (url) => {
        const urlString = url.toString();
        return (
          !urlString.includes('/auth/login') && !urlString.includes('/login')
        );
      },
      { timeout: LONG_TIMEOUT },
    );
  } catch {
    // May still be processing
  }

  await page.waitForLoadState('networkidle');

  // 7. Handle choose-user/workspace page if present
  const currentUrl = page.url();
  if (
    currentUrl.includes('/choose-user') ||
    currentUrl.includes('/chooseTenantUser')
  ) {
    console.log(`[login] Handling choose-user page...`);
    await handleChooseUserPage(page);
  }

  // 8. Wait for OAuth flow to complete — follow redirects through handover/callback
  await waitForOAuthFlowCompletion(page);

  // 9. Verify we're back on the demo app and authenticated
  const finalUrl = page.url();
  console.log(`[login] Login complete, final URL: ${finalUrl}`);

  // Verify tokens are stored in localStorage
  const hasTokens = await page.evaluate(() => {
    const raw = localStorage.getItem('bridge_tokens');
    if (!raw) return false;
    try {
      const tokens = JSON.parse(raw);
      return !!tokens?.accessToken;
    } catch {
      return false;
    }
  });

  if (!hasTokens) {
    throw new Error(
      `Login appeared to succeed but no tokens found in localStorage. Final URL: ${finalUrl}`,
    );
  }

  console.log(`[login] Tokens verified in localStorage`);
}

/**
 * Login via the SDK auth flow (direct email/password on the demo app — no redirect).
 *
 * Flow:
 * 1. Navigate to /auth/login
 * 2. Fill email and password on the single-step form
 * 3. Click Sign in
 * 4. Wait for tokens to appear in localStorage
 */
export async function loginViaSdkAuth(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  console.log(`[sdk-login] Starting SDK login for ${email}`);

  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');

  // Fill email and password on the single-step form
  const emailInput = page.locator('#login-email');
  await emailInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  await emailInput.fill(email);

  const passwordInput = page.locator('#login-password');
  await passwordInput.fill(password);

  const signInBtn = page.locator('button[type="submit"]:has-text("Sign in")');
  await signInBtn.click();

  // Wait for tokens to appear (SDK auth stores directly)
  await page.waitForFunction(
    () => {
      const raw = localStorage.getItem('bridge_tokens');
      if (!raw) return false;
      try {
        const tokens = JSON.parse(raw);
        return !!tokens?.accessToken;
      } catch {
        return false;
      }
    },
    { timeout: LONG_TIMEOUT },
  );

  // Wait for the post-login redirect to settle
  // (handleLogin calls goto('/protected') on successful login)
  await page.waitForURL('**/protected', { timeout: MED_TIMEOUT }).catch(() => {
    // May not redirect to /protected in all configurations — ignore
  });

  console.log(`[sdk-login] SDK login complete for ${email}. Current URL: ${page.url()}`);
}

/**
 * Handle the choose-user/workspace selection page.
 * If only one workspace is available, auto-selects it.
 */
async function handleChooseUserPage(page: Page): Promise<void> {
  // Wait for loading to finish
  const loadingSpinner = page.locator('svg.animate-spin');
  try {
    await loadingSpinner.waitFor({ state: 'hidden', timeout: LONG_TIMEOUT });
  } catch {
    // Already gone or doesn't exist
  }

  // Wait for workspace buttons to appear
  const workspaceButtons = page.locator('button:has(h3)');
  try {
    await workspaceButtons.first().waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  } catch {
    // May auto-select or no buttons
  }

  const buttonCount = await workspaceButtons.count();
  console.log(`[login] Found ${buttonCount} workspace(s) on choose-user page`);

  if (buttonCount === 0) {
    // May have auto-navigated away
    await page.waitForTimeout(2000);
    if (!page.url().includes('/choose-user')) {
      return;
    }
    throw new Error('No workspace buttons found on choose-user page');
  }

  // If only one workspace, click it
  if (buttonCount === 1) {
    const button = workspaceButtons.first();
    const name = await button.locator('h3').textContent().catch(() => 'Unknown');
    console.log(`[login] Auto-selecting single workspace: ${name}`);

    const navPromise = page.waitForURL(
      (url) => !url.pathname.includes('/choose-user'),
      { timeout: LONG_TIMEOUT },
    );
    await button.click();
    await navPromise;
    return;
  }

  // Multiple workspaces — click the first one
  const firstButton = workspaceButtons.first();
  const firstName = await firstButton.locator('h3').textContent().catch(() => 'Unknown');
  console.log(`[login] Selecting first workspace: ${firstName}`);

  const navPromise = page.waitForURL(
    (url) => !url.pathname.includes('/choose-user'),
    { timeout: LONG_TIMEOUT },
  );
  await firstButton.click();
  await navPromise;
}

/**
 * Wait for the OAuth redirect flow to complete.
 * Follows through handover, oauth-callback, and choose-user pages.
 */
async function waitForOAuthFlowCompletion(page: Page): Promise<void> {
  let redirectCount = 0;
  const maxRedirects = 10;

  while (redirectCount < maxRedirects) {
    const currentUrl = page.url();

    // If we're on a stable page (not auth/handover/callback), we're done
    const isTransitPage =
      currentUrl.includes('/handover') ||
      currentUrl.includes('/auth/oauth-callback') ||
      currentUrl.includes('/auth/chooseTenantUser') ||
      currentUrl.includes('/auth/choose-user');

    if (!isTransitPage) {
      break;
    }

    console.log(
      `[login] Waiting for OAuth flow, redirect #${redirectCount}: ${currentUrl}`,
    );

    // Handle choose-user if we land there
    if (
      currentUrl.includes('/choose-user') ||
      currentUrl.includes('/chooseTenantUser')
    ) {
      await handleChooseUserPage(page);
      redirectCount++;
      continue;
    }

    // Wait for navigation away from transit pages
    try {
      await page.waitForURL(
        (url) => {
          const urlString = url.toString();
          return (
            !urlString.includes('/handover') &&
            !urlString.includes('/auth/oauth-callback') &&
            !urlString.includes('/auth/chooseTenantUser')
          );
        },
        { timeout: LONG_TIMEOUT },
      );
    } catch {
      // Timeout — check state
    }

    await page.waitForLoadState('networkidle');
    redirectCount++;
  }

  if (redirectCount >= maxRedirects) {
    throw new Error(
      `OAuth flow exceeded maximum redirects (${maxRedirects}). URL: ${page.url()}`,
    );
  }
}
