import { test, expect, readBridgeTokens } from '../../fixtures/auth';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';

/**
 * LoginForm must never draw the credentials form to somebody who has already
 * authenticated (TBP-635).
 *
 * The bug: `LoginForm`'s top-level branch named `mfa-required`,
 * `mfa-setup-required` and `tenant-selection`, and let everything else fall
 * through to the credentials form. `authenticated` and `credentials-validated`
 * are not in that list, so between the session becoming real and the host
 * app's router landing, the component drew a password form to somebody who had
 * just successfully signed in — which reads as a refusal, and the reasonable
 * response is to type the password again. Measured at ~600ms against a local
 * stack; longer anywhere real.
 *
 * Why a MutationObserver rather than polling: the window is a race, and a
 * sampling loop that happens to look either side of it reports the bug fixed.
 * The observer records EVERY DOM batch, so a single frame showing a password
 * field is caught. This is the approach the ticket's own Test Strategy asks
 * for, including `checkVisibility()` rather than presence — a consumer that
 * works around the bug by hiding the form leaves it in the DOM, and that must
 * not read as a pass.
 *
 * The recording deliberately starts only once the auth state has left
 * `unauthenticated`. Before that the credentials form is *supposed* to be on
 * screen, including while the sign-in request is in flight. `LoginForm`'s
 * settling branch renders `[data-bridge-auth-settling]`, so its first
 * appearance is the observable moment the state moved past the password — from
 * that point on a visible password field is the defect.
 */

/** What the in-page observer reports back. */
interface SettlingReport {
  /** The session became real — tokens in storage, or the settling branch drawn. */
  settlingSeen: boolean;
  /** A VISIBLE password input was seen in a sample at or after that moment. */
  credentialsAfterSettling: boolean;
  /** Total samples inspected — a sanity check that the observer ran. */
  batches: number;
  /** True if the settling branch specifically was drawn (the fix's own marker). */
  settlingMarkerSeen: boolean;
}

/**
 * Install the recorder. Must run before the sign-in click so no batch is
 * missed. Everything lives on `window.__tbp635` so the assertion step can read
 * it back without a second evaluate racing the first.
 */
async function installSettlingRecorder(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const state = {
      settlingSeen: false,
      credentialsAfterSettling: false,
      batches: 0,
      settlingMarkerSeen: false,
    };
    (window as unknown as { __tbp635: typeof state }).__tbp635 = state;

    /**
     * Has the session become real? Deliberately NOT keyed on the settling
     * marker alone: that element is part of the fix, so a build without the
     * fix would simply never set it and this test would report "window never
     * entered" instead of catching the password form. Tokens in storage are
     * the fix-independent signal — auth-core writes them under a
     * `bridge_tokens`-prefixed key the moment the exchange resolves.
     */
    const sessionIsReal = (): boolean => {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || !key.startsWith('bridge_tokens')) continue;
          const raw = localStorage.getItem(key);
          if (raw && raw.includes('ccess')) return true; // access_token / accessToken
        }
      } catch {
        /* storage unavailable — fall back to the marker below */
      }
      return false;
    };

    const passwordVisible = (): boolean => {
      const field = document.querySelector("input[type='password']");
      if (!field) return false;
      // checkVisibility() where available: a form hidden by CSS is still a
      // form the consumer had to work around, but it is not a flash the user
      // sees — and presence alone would make this test unfalsifiable.
      const el = field as HTMLElement & { checkVisibility?: () => boolean };
      return typeof el.checkVisibility === 'function'
        ? el.checkVisibility()
        : !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    };

    const look = () => {
      state.batches++;
      // The settling spinner is LoginForm's post-credentials branch (the fix).
      if (document.querySelector('[data-bridge-auth-settling]')) {
        state.settlingMarkerSeen = true;
        state.settlingSeen = true;
      }
      // …or the session is simply real, however the component chose to render.
      if (sessionIsReal()) state.settlingSeen = true;
      if (state.settlingSeen && passwordVisible()) state.credentialsAfterSettling = true;
    };

    look();
    new MutationObserver(look).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    // A token landing is not a DOM mutation, and the offending render can be a
    // single frame. Sample on a short timer as well so neither is missed.
    setInterval(look, 16);
  });
}

async function readSettlingReport(
  page: import('@playwright/test').Page,
): Promise<SettlingReport> {
  return page.evaluate(
    () => (window as unknown as { __tbp635: SettlingReport }).__tbp635,
  );
}

test.describe('LoginForm never shows the credentials form post-auth (TBP-635)', () => {
  test('single-workspace sign-in: no password field between success and the host route', async ({
    page,
    testUser,
  }) => {
    await page.goto('/auth/login');

    const emailInput = page.locator('#login-email');
    await emailInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await emailInput.fill(testUser.email);
    await page.locator('#login-password').fill(testUser.password);

    // Arm the recorder while the form is still the legitimate thing on screen.
    await installSettlingRecorder(page);

    await page.locator('button[type="submit"]:has-text("Sign in")').click();

    // The session becoming real is what opens the window under test.
    await expect
      .poll(async () => !!(await readBridgeTokens(page))?.accessToken, {
        timeout: LONG_TIMEOUT,
      })
      .toBe(true);

    const report = await readSettlingReport(page);

    // Guard against a vacuous pass: if the observer never ran, or never saw the
    // post-credentials state, the absence of a password field proves nothing.
    expect(report.batches, 'MutationObserver recorded no DOM batches').toBeGreaterThan(0);
    expect(
      report.settlingSeen,
      'never observed the session becoming real — the window this test guards ' +
        'was never entered, so a pass here would be meaningless',
    ).toBe(true);

    // The defect itself, asserted first: this is the thing a user saw.
    expect(
      report.credentialsAfterSettling,
      'the credentials form was drawn to an already-authenticated user',
    ).toBe(false);

    // The fix renders a dedicated settling branch. Asserting the marker keeps
    // "no password field" from being satisfied by, say, an unmounted form.
    expect(
      report.settlingMarkerSeen,
      'LoginForm never drew its settling branch — `authenticated` is falling ' +
        'through to some other branch',
    ).toBe(true);
  });

  test('the settling state shows a waiting affordance, not an empty card', async ({
    page,
    testUser,
  }) => {
    // AC: `authenticated` renders a WAITING state. Asserting only the absence
    // of a password field would also pass for a blank card, which is a
    // different bug wearing the same test.
    await page.goto('/auth/login');

    const emailInput = page.locator('#login-email');
    await emailInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await emailInput.fill(testUser.email);
    await page.locator('#login-password').fill(testUser.password);

    const settling = page.locator('[data-bridge-auth-settling]');
    await page.locator('button[type="submit"]:has-text("Sign in")').click();

    // The window is short and ends when the consumer navigates, so take the
    // first frame it exists rather than waiting for a stable state.
    await settling.waitFor({ state: 'attached', timeout: LONG_TIMEOUT });
    await expect(settling).toContainText(/signing in/i);
  });
});
