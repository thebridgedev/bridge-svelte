/**
 * Deep-link preservation through the HOSTED login portal (TBP-629).
 *
 * Hosted mode cannot carry the target on the URL: `createLoginUrl()` feeds
 * `redirectUri` to the OAuth authorize call and bridge-api exact-matches it
 * against `allowedRedirectUris`, so appending anything would break login rather
 * than improve it. The target is stashed in sessionStorage before the handoff
 * and consumed at the callback, where the code used to `redirect(303, '/')`
 * unconditionally — that hard-coded `/` is the bug this covers.
 *
 * Regression: an emailed deep link "just logs us into the system". (2026-09-11)
 *
 * This exercises a real OAuth round-trip against the local hosted portal
 * (bridge-cloud-views), not a stub.
 */

import { completeHostedPortalLogin, expect, test } from '../../fixtures/auth';
import { LONG_TIMEOUT } from '../../fixtures/timeouts';

/** A protected route that is NOT the `/` the callback used to hard-code. */
const DEEP_LINK = '/team-panel?case=42&doc=export-a1b2';

/** `pathname + search` of the page, i.e. what the user would call "where I am". */
function currentTarget(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

test.describe('Return-to deep links — hosted mode (TBP-629)', () => {
  test('a deep link survives the hosted portal OAuth round-trip', async ({
    page,
    testUser,
    envConfig,
  }) => {
    const demoOrigin = new URL(envConfig.baseUrl).origin;

    // Flip the demo into hosted mode (no `loginRoute`) for this browser context
    // only — see the toggle in demo/src/routes/+layout.ts.
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('bridge:hostedMode', 'true'));

    await page.goto(DEEP_LINK);

    // The guard hands off to the hosted portal, which lives on another origin.
    await expect
      .poll(() => new URL(page.url()).origin, { timeout: LONG_TIMEOUT })
      .not.toBe(demoOrigin);

    await completeHostedPortalLogin(page, testUser.email, testUser.password);

    // Back on our origin, at the deep link — not at the `/` the callback used to
    // hard-code.
    await expect
      .poll(() => currentTarget(page.url()), { timeout: LONG_TIMEOUT })
      .toBe(DEEP_LINK);
    expect(new URL(page.url()).origin).toBe(demoOrigin);

    // One-shot by design: a value left in storage would hijack the next login in
    // this tab.
    const leftover = await page.evaluate(() =>
      sessionStorage.getItem('bridge_return_to'),
    );
    expect(leftover).toBeNull();
  });
});
