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
import {
  BASELINE_APP_CONFIG,
  isBaselineConfig,
  markAppConfigDirty,
  takeAppConfigDirty,
  workerAppFor,
  type WorkerApp,
} from './worker-app';

/** Shape of the token blob auth-core persists to localStorage. */
export interface BridgeTokens {
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
}

/**
 * Read the auth-core token blob from the page's localStorage.
 *
 * auth-core namespaces the storage key as `bridge_tokens:<appId>` (older builds
 * used the bare `bridge_tokens`) — match either by prefix. Returns the parsed
 * tokens object, or `null` when absent/unparseable. Single source of truth for
 * every token read across the e2e suite, so the key-resolution logic lives in
 * exactly one place.
 */
export function readBridgeTokens(page: Page): Promise<BridgeTokens | null> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(
      (k) => k === 'bridge_tokens' || k.startsWith('bridge_tokens:'),
    );
    const raw = key ? localStorage.getItem(key) : null;
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });
}

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
  /** The Bridge app this worker owns — see fixtures/worker-app.ts (TBP-604) */
  workerApp: WorkerApp;
  /**
   * Auto-use guard that puts this worker's app back on {@link BASELINE_APP_CONFIG}
   * when the previous test in this worker left it off it. Depend on it to order
   * work after the reset.
   */
  appConfigBaseline: void;
}

/**
 * Extended test with authentication fixtures.
 * Import this instead of '@playwright/test' in your spec files.
 */
export const test = base.extend<AuthFixtures>({
  // The Bridge app provisioned for this worker by global-setup (TBP-604).
  workerApp: async ({}, use, testInfo) => {
    await use(workerAppFor(testInfo.parallelIndex));
  },

  // Every browser context in this worker boots the demo with THIS worker's app
  // id (seeded as localStorage `bridge:appId`), which is what stops one worker's
  // app-level writes from being visible to another. Overrides the config-level
  // `use.storageState`.
  storageState: async ({ workerApp }, use) => {
    await use(workerApp.storageStatePath);
  },

  // Environment configuration, narrowed to this worker's app.
  envConfig: async ({ workerApp }, use) => {
    const env = getCurrentEnvironment();
    const config = getEnvironmentConfig(env);
    await use({ ...config, appId: workerApp.appId, appDomain: workerApp.appDomain });
  },

  // Test data client for API operations. `configureApp` is wrapped so the
  // baseline guard below knows whether anything actually needs undoing —
  // without it we would either reset on every single test (one wasted stage
  // round-trip per test) or not at all.
  testDataClient: async ({ envConfig }, use) => {
    const client = new TestDataClient(envConfig);
    const configureApp = client.configureApp.bind(client);
    client.configureApp = async (config) => {
      if (!isBaselineConfig(config)) markAppConfigDirty();
      return configureApp(config);
    };
    await use(client);
  },

  // Restore the app-level baseline when — and only when — a previous test in
  // this worker moved off it.
  //
  // This replaces an unconditional `configureApp({paymentsAutoRedirect: false,
  // stripeEnabled: false})` that ran on EVERY test as part of `testUser`. That
  // write was the widest part of the TBP-604 race: any test merely starting up
  // disabled Stripe underneath a concurrent Stripe flow, which is why
  // `subscription-flows.spec.ts` passed scoped and failed in the full suite.
  // It is safe now because the app is this worker's alone and tests within a
  // worker run serially — and it is cheap because it fires only after a spec
  // that really did change something.
  appConfigBaseline: [
    async ({ testDataClient }, use) => {
      if (takeAppConfigDirty()) {
        await testDataClient.configureApp({ ...BASELINE_APP_CONFIG }).catch(() => {});
      }
      await use();
    },
    { auto: true },
  ],

  // Test user — created before test, cleaned up after
  testUser: async ({ testDataClient, appConfigBaseline }, use) => {
    // `appConfigBaseline` is depended on, not used: it orders the reset before
    // the account is created, so the new tenant is onboarded against the
    // baseline app config rather than whatever the last test left behind.
    void appConfigBaseline;

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

  await completeHostedPortalLogin(page, email, password);
}

/**
 * Complete a hosted-portal (OAuth) login **from the portal page the browser is
 * already on**, and follow the round-trip all the way back to the app.
 *
 * Split out of {@link loginViaBridgeAuth} for TBP-629: the hosted deep-link test
 * arrives at the portal because the route guard sent it there, not because it
 * clicked a login button, and it must assert where the callback lands rather
 * than have a helper wait for a fixed destination.
 */
export async function completeHostedPortalLogin(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  // 4. Credentials. The hosted portal is a SINGLE-step form — email and password
  // on one screen. It used to be two steps behind a "Continue" button, and this
  // helper still described that shape as of 2026-09-11 even though no spec
  // exercised it, so nothing caught the drift.
  const emailInput = page.getByRole('textbox', { name: 'Email' });
  await emailInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  await emailInput.fill(email);

  const passwordInput = page.getByRole('textbox', { name: 'Password' });
  await passwordInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  await passwordInput.fill(password);

  // The button is disabled until both fields validate, so wait for enabled
  // rather than merely visible.
  const signInButton = page.getByRole('button', { name: 'Sign in', exact: true });
  await expect(signInButton).toBeEnabled({ timeout: MED_TIMEOUT });
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

  // The next branch reads page.url(), so the document that redirect landed on
  // has to be parsed first. domcontentloaded is the wait that says exactly
  // that and always fires; the demo holds a persistent Centrifugo WebSocket, so
  // waiting for network idle never would (TBP-605).
  await page.waitForLoadState('domcontentloaded');

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

  // Verify tokens are stored in localStorage.
  const tokens = await readBridgeTokens(page);

  if (!tokens?.accessToken) {
    throw new Error(
      `Login appeared to succeed but no tokens found in localStorage. Final URL: ${finalUrl}`,
    );
  }

  console.log(`[login] Tokens verified in localStorage`);
}

/**
 * Fill and submit the SDK login form **on whatever login page the browser is
 * already sitting on**, then wait for tokens to land in localStorage.
 *
 * Split out of {@link loginViaSdkAuth} for TBP-629: the deep-link tests must
 * arrive at the login route via the route guard (so the `?redirectUri=…` the
 * guard attached is still on the URL), which rules out the `goto('/auth/login')`
 * that `loginViaSdkAuth` starts with. Deliberately does NOT assert where the app
 * navigates afterwards — that destination is the thing under test.
 */
export async function submitSdkLoginForm(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  // Fill email and password on the single-step form
  const emailInput = page.locator('#login-email');
  await emailInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  await emailInput.fill(email);

  const passwordInput = page.locator('#login-password');
  await passwordInput.fill(password);

  const signInBtn = page.locator('button[type="submit"]:has-text("Sign in")');
  await signInBtn.click();

  // Wait for tokens to appear (SDK auth stores directly).
  await expect
    .poll(async () => !!(await readBridgeTokens(page))?.accessToken, {
      timeout: LONG_TIMEOUT,
    })
    .toBe(true);
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

  await submitSdkLoginForm(page, email, password);

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

    // The loop's next pass reads page.url() to decide whether we are still on a
    // transit page, so the landed document must be parsed. domcontentloaded
    // states that and terminates; waiting for network idle cannot, because the
    // demo keeps a Centrifugo WebSocket open (TBP-605).
    await page.waitForLoadState('domcontentloaded');
    redirectCount++;
  }

  if (redirectCount >= maxRedirects) {
    throw new Error(
      `OAuth flow exceeded maximum redirects (${maxRedirects}). URL: ${page.url()}`,
    );
  }
}
