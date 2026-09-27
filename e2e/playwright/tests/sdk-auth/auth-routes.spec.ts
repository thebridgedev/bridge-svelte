/**
 * One file serves every auth page (TBP-696).
 *
 * The demo's `src/routes/auth/[...bridge]/+page.svelte` is exactly what the
 * guides tell an app to write: `<BridgeAuthRoutes />`. A test fixture,
 * `(test-fixtures)/auth/login/+page.svelte`, takes over /auth/login — the
 * "take over one page" rung — which is what the override tests below lean on. `/auth/framed/[...bridge]` is the same
 * component restyled with the `frame` and `heading` snippets.
 *
 * The regression this exists for: bridge-api writes `/auth/set-password/<token>`
 * into every signup verification email, and an app that skipped that page sent
 * 100% of new signups to a 404.
 */

import { test, expect, readBridgeTokens } from '../../fixtures/auth';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';

/** The catch-all's wrapper for a page — present only when BridgeAuthRoutes rendered it. */
const served = (page: string) => `[data-bridge-auth-route="${page}"]`;

test.describe('BridgeAuthRoutes — every page from one file (TBP-696)', () => {
  test('each segment renders its component', async ({ page }) => {
    const cases: Array<[path: string, route: string, control: string]> = [
      ['/auth/signup', 'signup', '#signup-email'],
      ['/auth/set-password/not-a-real-token', 'set-password', '#newPassword'],
      ['/auth/forgot-password', 'forgot-password', '#reset-email'],
      ['/auth/magic-link', 'magic-link', '#magic-email'],
      // An invalid token still renders PasskeySetup — its error state.
      ['/auth/setup-passkey/not-a-real-token', 'setup-passkey', '[data-bridge-auth-form]'],
      // /auth/login is owned by the demo, so the catch-all's login is reached here.
      ['/auth/framed/login', 'login', '#login-email'],
    ];

    for (const [path, route, control] of cases) {
      await page.goto(path);
      await expect(page.locator(`${served(route)} ${control}`), path).toBeVisible({ timeout: MED_TIMEOUT });
    }
  });

  test('oauth-callback is served and renders nothing of its own', async ({ page }) => {
    await page.goto('/auth/oauth-callback');
    await expect(page.locator(served('oauth-callback'))).toBeAttached({ timeout: MED_TIMEOUT });
    await expect(page.locator('[data-bridge-auth-form]')).toHaveCount(0);
  });

  test('workspaces lists the signed-in user’s workspaces', async ({ authenticatedPage: page }) => {
    await page.goto('/auth/workspaces');
    const selector = page.locator(`${served('workspaces')} [data-bridge-workspace-selector]`);
    await expect(selector).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(selector.locator('[data-bridge-workspace-item]').first()).toBeVisible({ timeout: LONG_TIMEOUT });
  });

  test('workspaces sends a signed-out visitor to sign in, and back', async ({ page }) => {
    await page.goto('/auth/workspaces');
    await page.waitForURL((url) => url.pathname === '/auth/login', { timeout: MED_TIMEOUT });
    expect(new URL(page.url()).searchParams.get('redirectUri')).toBe('/auth/workspaces');
  });

  test('a magic link redeemed on /auth/magic-link signs in and leaves the page', async ({
    page,
    testUser,
    testDataClient,
    envConfig,
  }) => {
    // The emailed link returns to the page it was requested from (TBP-682).
    await page.goto('/auth/magic-link');
    await page.locator(`${served('magic-link')} #magic-email`).fill(testUser.email);
    await page.getByRole('button', { name: 'Send magic link' }).click();
    await expect(page.locator('[data-bridge-alert][data-variant="success"]')).toBeVisible({ timeout: MED_TIMEOUT });

    const { token } = await testDataClient.getMagicLinkToken(envConfig.appId, testUser.email);
    await page.goto(`/auth/magic-link?bridge_magic_link_token=${encodeURIComponent(token)}`);

    // MagicLink has no onLogin of its own; BridgeAuthRoutes moves the user on.
    await page.waitForURL((url) => url.pathname === '/', { timeout: LONG_TIMEOUT });
    expect((await readBridgeTokens(page))?.accessToken).toBeTruthy();
  });

  test('an unknown segment gets the app’s own 404, not a form', async ({ page }) => {
    for (const path of ['/auth/not-a-page', '/auth/set-password', '/auth/login-typo/x']) {
      await page.goto(path);
      await expect(page.getByText('404').first(), path).toBeVisible({ timeout: MED_TIMEOUT });
      await expect(page.locator('[data-bridge-auth-route]'), path).toHaveCount(0);
    }
  });
});

test.describe('Hosted login uses the same file (TBP-696)', () => {
  test.beforeEach(async ({ page }) => {
    // No `loginRoute` = hosted mode; see `bridge:hostedMode` in demo/src/lib/test-fixtures/bootstrap.ts.
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('bridge:hostedMode', 'true'));
  });

  test('sign-in pages explain that login is hosted and link to it', async ({ page, envConfig }) => {
    const demoOrigin = new URL(envConfig.baseUrl).origin;
    for (const route of ['signup', 'set-password/x', 'forgot-password', 'magic-link']) {
      await page.goto(`/auth/${route}`);
      const notice = page.locator('[data-bridge-auth-hosted]');
      await expect(notice, route).toBeVisible({ timeout: MED_TIMEOUT });
      await expect(notice, route).toContainText('hosted');
      const href = await notice.locator('a.bridge-btn').getAttribute('href');
      expect(href, route).toBeTruthy();
      expect(new URL(href!).origin, route).not.toBe(demoOrigin);
      // No in-app form is offered alongside it.
      await expect(page.locator('#signup-email, #newPassword, #reset-email, #magic-email'), route).toHaveCount(0);
    }
  });

  test('oauth-callback still renders nothing', async ({ page }) => {
    await page.goto('/auth/oauth-callback');
    await expect(page.locator(served('oauth-callback'))).toBeAttached({ timeout: MED_TIMEOUT });
    await expect(page.locator('[data-bridge-auth-hosted], [data-bridge-auth-form]')).toHaveCount(0);
  });
});
