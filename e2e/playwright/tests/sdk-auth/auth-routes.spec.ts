/**
 * One file serves every auth page (TBP-696).
 *
 * The demo's `src/routes/auth/[...bridge]/+page.svelte` is exactly what the
 * guides tell an app to write: `<BridgeAuthRoutes />`. The demo also keeps its
 * own `auth/login/+page.svelte` — the "take over one page" rung — which is what
 * the override tests below lean on. `/auth/framed/[...bridge]` is the same
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

test.describe('Taking over one page by creating it (TBP-696)', () => {
  test('the app’s own auth/login/+page.svelte wins over the catch-all', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.locator('[data-demo-login-override] #login-email')).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(page.locator('[data-bridge-auth-route]')).toHaveCount(0);
  });

  test('with login taken over, the pages it does not own still resolve', async ({ page }) => {
    // The demo owns ONLY login. Before TBP-696 each of these needed its own file.
    for (const [path, route] of [
      ['/auth/set-password/x', 'set-password'],
      ['/auth/signup', 'signup'],
      ['/auth/forgot-password', 'forgot-password'],
    ] as const) {
      await page.goto(path);
      await expect(page.locator(served(route)).locator('[data-bridge-auth-form]'), path).toBeVisible({
        timeout: MED_TIMEOUT,
      });
    }
  });

  test('signup verification lands on a set-password form nobody hand-wrote', async ({
    page,
    testDataClient,
  }) => {
    const email = `iman+playwright-test-authroutes-${Date.now()}@nebulr.group`;
    try {
      await page.goto('/auth/signup');
      await page.locator(`${served('signup')} #signup-email`).fill(email);
      await page.locator('#signup-first-name').fill('Auth');
      await page.locator('#signup-last-name').fill('Routes');
      await page.locator('button:has-text("Sign up")').click();
      await expect(page.locator('h2:has-text("Check your email")')).toBeVisible({ timeout: LONG_TIMEOUT });

      // The exact address bridge-api put in the email.
      const { link } = await testDataClient.getSignupVerificationLink(email);
      const target = new URL(link);
      expect(target.pathname).toMatch(/^\/auth\/set-password\/[^/]+$/);

      await page.goto(`${target.pathname}${target.search}`);
      await expect(page.locator(`${served('set-password')} #newPassword`)).toBeVisible({ timeout: MED_TIMEOUT });
      await expect(page.locator('#confirmPassword')).toBeVisible();
    } finally {
      await testDataClient.removeTestAccount(email).catch(() => {});
    }
  });
});

test.describe('Hosted login uses the same file (TBP-696)', () => {
  test.beforeEach(async ({ page }) => {
    // No `loginRoute` = hosted mode; see the toggle in demo/src/routes/+layout.ts.
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

test.describe('frame and heading snippets (TBP-696, TBP-537)', () => {
  test('frame wraps every page and heading replaces each main-step heading', async ({ page }) => {
    for (const [route, control] of [
      ['login', '#login-email'],
      ['signup', '#signup-email'],
      ['set-password/x', '#newPassword'],
      ['forgot-password', '#reset-email'],
      ['magic-link', '#magic-email'],
    ] as const) {
      const name = route.split('/')[0];
      await page.goto(`/auth/framed/${route}`);
      const frame = page.locator(`[data-demo-frame="${name}"]`);
      await expect(frame.locator(control), route).toBeVisible({ timeout: MED_TIMEOUT });
      await expect(frame.locator(`[data-demo-heading="${name}"]`), route).toBeVisible();
      // The snippet REPLACES the built-in heading rather than adding a second one.
      await expect(frame.locator('h1, h2'), route).toHaveCount(1);
      // `frame` replaces the default container entirely.
      await expect(page.locator('.bridge-auth-page'), route).toHaveCount(0);
    }
  });

  test('on a login sub-step the frame stays and the heading does not stack (TBP-537)', async ({ page }) => {
    await page.goto('/auth/framed/login');
    const frame = page.locator('[data-demo-frame="login"]');
    await expect(frame.locator('[data-demo-heading="login"]')).toBeVisible({ timeout: MED_TIMEOUT });

    await frame.getByRole('button', { name: 'Forgot password?' }).click();

    await expect(frame.locator('#forgot-email')).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(frame.locator('[data-demo-heading]')).toHaveCount(0);
    await expect(frame.locator('h1, h2')).toHaveCount(1);
    await expect(frame.locator('h2')).toHaveText('Reset your password');

    // And back: the page heading returns with the credentials step.
    await frame.getByRole('button', { name: 'Back to login' }).click();
    await expect(frame.locator('[data-demo-heading="login"]')).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(frame.locator('h1, h2')).toHaveCount(1);
  });

  test('without snippets the default frame is used', async ({ page }) => {
    await page.goto('/auth/signup');
    await expect(page.locator(`${served('signup')} .bridge-auth-page #signup-email`)).toBeVisible({
      timeout: MED_TIMEOUT,
    });
  });
});
