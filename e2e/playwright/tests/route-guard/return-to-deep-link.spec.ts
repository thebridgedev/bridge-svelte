/**
 * Deep-link preservation through the SDK-mode login (TBP-629).
 *
 * Regression: the SDK-mode route guard dropped the attempted URL, so every
 * protected deep link landed on the app's default route after login — the
 * customer symptom was an emailed link to an exported case file that "just logs
 * us into the system". (2026-09-11)
 *
 * Every assertion here is on the URL the browser actually ended up at. "No
 * error" and "a login happened" are both true of the broken build, so neither
 * is allowed to be what passes a test in this file.
 *
 * Hosted mode (no `loginRoute`, target stashed in sessionStorage and consumed at
 * the OAuth callback) is NOT covered here: the demo app configures
 * `loginRoute: '/auth/login'` in `demo/src/routes/+layout.ts`, so every
 * navigation in this suite takes the SDK-mode branch by construction.
 */

import { expect, submitSdkLoginForm, test } from '../../fixtures/auth';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';

/** The demo's login route (`loginRoute` in demo/src/routes/+layout.ts). */
const LOGIN_ROUTE = '/auth/login';

/** Where the demo's login page sends you when there is nothing to return to. */
const DEFAULT_REDIRECT_ROUTE = '/protected';

/**
 * A protected route that is NOT the default redirect route. The distinction is
 * the entire point: if the deep link and the default destination were the same
 * page, "landed on the deep link" and "landed on the default" would be the same
 * assertion and the test would pass on the broken build.
 */
const DEEP_LINK = '/team-panel?case=42&doc=export-a1b2';

/** Query parameter the guard uses to carry the return target (auth-core default). */
const RETURN_TO_PARAM = 'redirectUri';

/** `pathname + search` of the page, i.e. what the user would call "where I am". */
function currentTarget(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

/**
 * Record the origin of every frame navigation from here on.
 *
 * "Where did we end up" is necessary but not sufficient for an open-redirect
 * test: a build that bounced through the attacker's origin and came back would
 * still finish on the right page. This catches the trip itself.
 */
function recordNavigatedOrigins(page: import('@playwright/test').Page): string[] {
  const origins: string[] = [];
  page.on('framenavigated', (frame) => {
    try {
      origins.push(new URL(frame.url()).origin);
    } catch {
      // about:blank and friends have no parseable origin — not a navigation we
      // care about, and swallowing it here cannot hide a real off-origin hop.
    }
  });
  return origins;
}

test.describe('Return-to deep links (TBP-629)', () => {
  test('deep link with a query string survives the in-app login', async ({
    page,
    testUser,
  }) => {
    await page.goto(DEEP_LINK);

    // The guard must bounce us to the in-app login carrying the full attempted
    // target — path AND query. A path-only value is the same bug for any route
    // whose identity lives in the query (`?key=`, `?doc=`).
    await page.waitForURL((url) => url.pathname === LOGIN_ROUTE, {
      timeout: LONG_TIMEOUT,
    });
    const loginUrl = new URL(page.url());
    expect(loginUrl.searchParams.get(RETURN_TO_PARAM)).toBe(DEEP_LINK);

    await submitSdkLoginForm(page, testUser.email, testUser.password);

    await page.waitForURL((url) => url.pathname !== LOGIN_ROUTE, {
      timeout: LONG_TIMEOUT,
    });

    // The headline assertion: the exact deep link, query included.
    expect(currentTarget(page.url())).toBe(DEEP_LINK);
    // ...and explicitly NOT the default route, which is what the bug produced.
    expect(new URL(page.url()).pathname).not.toBe(DEFAULT_REDIRECT_ROUTE);
  });

  /**
   * Two spellings of the same attack. `//host` matters on its own because it is
   * the one a naive "must start with /" check waves through.
   *
   * `127.0.0.1:3001` is deliberately a *reachable* foreign origin — it serves
   * the very same demo — so a build without the validation genuinely lands
   * somewhere, and the origin assertion has something real to catch. A
   * never-resolving host would make an unvalidated redirect fail by accident
   * and let a broken build look safe.
   */
  for (const { label, crafted } of [
    { label: 'absolute', crafted: 'https://example.invalid/pwn' },
    { label: 'protocol-relative', crafted: '//example.invalid/pwn' },
    { label: 'absolute, reachable foreign origin', crafted: 'http://127.0.0.1:3001/protected' },
    { label: 'protocol-relative, reachable foreign origin', crafted: '//127.0.0.1:3001/protected' },
  ]) {
    test(`a crafted ${label} return target cannot redirect off the origin`, async ({
      page,
      testUser,
      envConfig,
    }) => {
      const demoOrigin = new URL(envConfig.baseUrl).origin;
      const navigatedOrigins = recordNavigatedOrigins(page);

      await page.goto(`${LOGIN_ROUTE}?${RETURN_TO_PARAM}=${encodeURIComponent(crafted)}`);

      await submitSdkLoginForm(page, testUser.email, testUser.password);

      // Rejected outright rather than repaired, so the login page falls back to
      // its own default route. Polled rather than waited-for so a regression
      // reports the URL it actually reached instead of a bare timeout.
      await expect
        .poll(() => currentTarget(page.url()), { timeout: LONG_TIMEOUT })
        .toBe(DEFAULT_REDIRECT_ROUTE);

      // The security assertions, stated explicitly: where we ended up, and
      // everywhere we went on the way.
      expect(new URL(page.url()).origin).toBe(demoOrigin);
      expect(new Set(navigatedOrigins)).toEqual(new Set([demoOrigin]));
    });
  }

  test('the guard never makes an auth route its own return target', async ({ page }) => {
    // Going straight to the login route must not produce a return target at all.
    // If it did, completing login would send the visitor back to the login form
    // they just completed.
    await page.goto(LOGIN_ROUTE);
    // The rendered form is the proof the guard ran and left us here; only then is
    // the absence of a return target meaningful. (No networkidle wait — the demo
    // holds a Centrifugo WebSocket, so the network never goes idle, TBP-605.)
    await page.locator('#login-email').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    expect(new URL(page.url()).searchParams.get(RETURN_TO_PARAM)).toBeNull();

    // Same for a sibling auth route, which is public for the same reason.
    await page.goto('/auth/signup');
    await page.locator('#signup-email').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    expect(new URL(page.url()).searchParams.get(RETURN_TO_PARAM)).toBeNull();

    // And when the guard DOES emit one, it points at the protected route that
    // was refused — never back at an auth route.
    await page.goto(DEEP_LINK);
    await page.waitForURL((url) => url.pathname === LOGIN_ROUTE, {
      timeout: LONG_TIMEOUT,
    });
    const emitted = new URL(page.url()).searchParams.get(RETURN_TO_PARAM);
    expect(emitted).toBe(DEEP_LINK);
    expect(emitted!.split('?')[0]).not.toMatch(/^\/auth(\/|$)/);
  });

  test('login with no deep link still lands on the default redirect route', async ({
    page,
    testUser,
  }) => {
    // Regression guard for the other direction: the fix must not change what
    // happens for the ordinary "click login, go to the app" path.
    await page.goto(LOGIN_ROUTE);
    // Same as above: the form has to be on screen before "no return target" says
    // anything. No networkidle wait — see TBP-605.
    await page.locator('#login-email').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    expect(new URL(page.url()).searchParams.get(RETURN_TO_PARAM)).toBeNull();

    await submitSdkLoginForm(page, testUser.email, testUser.password);

    await page.waitForURL((url) => url.pathname === DEFAULT_REDIRECT_ROUTE, {
      timeout: LONG_TIMEOUT,
    });
    expect(currentTarget(page.url())).toBe(DEFAULT_REDIRECT_ROUTE);

    // The page really rendered — a URL that is right for a page that 500s would
    // be a hollow pass.
    await expect(page.locator('h1:has-text("Protected Page")')).toBeVisible({
      timeout: MED_TIMEOUT,
    });
  });
});
