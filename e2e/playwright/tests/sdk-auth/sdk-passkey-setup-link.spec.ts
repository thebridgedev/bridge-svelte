/**
 * SDK Passkey Setup Link Request — TBP-535 regression
 *
 * Regression coverage for a bug in DirectAuthService.requestPasskeySetupLink():
 * it POSTed to /passkeys/request-setup-link without `mode: 'sdk'` in the body,
 * unlike every sibling SDK method. bridge-api's endpoint branches on
 * `body.mode === 'sdk'` — without it, the request always fell through to a
 * cookie-based OAuth-context check that SDK mode can never satisfy, so it
 * always threw ClientUnauthenticatedError ("App is unauthenticated. This
 * usually means your APP ID or API Key is not valid.") even though the app
 * ID/API key were always fine. This went undetected because "create a new
 * passkey" via the SDK had no test coverage at all.
 *
 * This test drives the real PasskeyLogin.svelte + PasskeyRequestSetupLink.svelte
 * components (not a raw fetch call) and asserts the regression is fixed: the
 * "Create a passkey" form submits successfully and reaches "Check your email"
 * instead of surfacing the unauthenticated error.
 *
 * --- Reaching the "Create a passkey" form ---
 *
 * PasskeyLogin.svelte's "Don't have a passkey? Create one." link is only
 * rendered from within its own `{#if error}` branch — it does NOT appear
 * merely because passkeys are enabled. In practice there are two ways a user
 * lands on the setup-link form:
 *   1. handlePasskeyLogin() catches a WebAuthn NotAllowedError (no matching
 *      credential — the common case for a user who has never registered a
 *      passkey) and, when `onSetupPasskey` is wired (it is, from LoginForm),
 *      calls it directly and returns *before* setting `error` — so the UI
 *      transitions straight to the setup-link form without the "Create one."
 *      link ever rendering.
 *   2. Any *other* passkey-auth failure sets `error` and additionally shows
 *      the "Create one." link (for a user who *has* a passkey but hit some
 *      other failure) — not reachable deterministically without forcing an
 *      unrelated failure mode.
 *
 * This test drives path (1): a resident-key-capable CDP virtual authenticator
 * is attached with zero registered credentials (same WebAuthn.enable /
 * addVirtualAuthenticator pattern as sdk-passkey-ceremony.spec.ts), so
 * clicking PasskeyLogin's real "Sign in with Passkeys" button for a fresh
 * test user — who has no passkey — deterministically produces a fast
 * NotAllowedError from the (virtual, presence-auto-simulated) authenticator
 * instead of hanging on a real hardware prompt. This is exactly what happens
 * for a real first-time user in a real browser, so it is the accurate way to
 * reach the "Create a passkey" form through genuine UI interaction.
 */

import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT, LONG_TIMEOUT } from '../../fixtures/timeouts';

test.describe('SDK Passkey Setup Link Request', () => {
  test('submitting the "Create a passkey" form reaches "Check your email", not the unauthenticated error', async ({
    page,
    testUser,
  }) => {
    // Attach an empty virtual authenticator BEFORE any WebAuthn call so the
    // upcoming navigator.credentials.get() fails fast (no matching credential)
    // instead of waiting on a real device prompt that never resolves headless.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });

    try {
      await page.goto('/auth/login');
      await page.waitForLoadState('networkidle');
      await page.locator('#login-email').waitFor({ state: 'visible', timeout: MED_TIMEOUT });

      // Real "Sign in with Passkeys" button (PasskeyLogin.svelte).
      const passkeyBtn = page.locator('[data-bridge-passkey-login]');
      await expect(passkeyBtn).toBeVisible({ timeout: MED_TIMEOUT });
      await passkeyBtn.click();

      // No matching credential on the virtual authenticator -> NotAllowedError
      // -> auto-transitions to PasskeyRequestSetupLink's form.
      await expect(page.getByRole('heading', { name: 'Create a passkey' })).toBeVisible({
        timeout: MED_TIMEOUT,
      });

      const emailInput = page.locator('#passkey-request-email');
      await emailInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
      await emailInput.fill(testUser.email);

      await page.getByRole('button', { name: 'Send setup link' }).click();

      // Regression assertion: before the fix, this exact submission always
      // surfaced an error Alert with "App is unauthenticated..." instead of
      // ever reaching the sent-state. Assert both directions — the error
      // never appears, and the real success state is reached.
      const errorAlert = page.locator('[data-bridge-alert][data-variant="error"]');
      await expect(errorAlert).not.toBeVisible();
      await expect(page.getByText(/unauthenticated/i)).not.toBeVisible();

      await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible({
        timeout: LONG_TIMEOUT,
      });
      await expect(errorAlert).not.toBeVisible();
    } finally {
      await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId }).catch(() => {});
    }
  });
});
