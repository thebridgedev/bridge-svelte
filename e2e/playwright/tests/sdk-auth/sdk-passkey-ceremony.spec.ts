/**
 * SDK Passkey Ceremony (real WebAuthn) Tests — TBP-443
 *
 * Drives a REAL WebAuthn ceremony end to end against the running bridge-api,
 * using Chrome's CDP WebAuthn domain with a resident-key-capable virtual
 * authenticator (a real `navigator.credentials.create()`/`.get()` call,
 * intercepted by a virtual authenticator instead of a physical device) from
 * the demo's own origin (localhost). This proves a real browser accepts
 * bridge-api's origin-derived RP ID and completes a full ceremony against
 * it — the RP-ID derivation math itself is already covered by
 * passkeys-rp-id.util.spec.ts; nothing else in the codebase exercises an
 * actual WebAuthn ceremony.
 *
 * --- Known limitation: registration does not click through PasskeySetup.svelte ---
 *
 * PasskeySetup.svelte (and auth-core's DirectAuthService.getPasskeyRegistrationOptions)
 * hard-code the `passkeySetupToken` query param. That token is only ever minted
 * server-side by POST /auth/passkeys/request-setup-link and delivered by email —
 * and bridge-api's local dev build short-circuits all outbound email
 * (NebulrEmailService._send: `isDev && !SEND_EMAILS_IN_DEV` returns a fake id
 * without ever rendering/logging/persisting the email body), so the token can't
 * be intercepted either. Unlike the sibling forgot-password flow — which
 * testDataClient.getPasswordResetLink() already exposes as a test-data endpoint
 * for exactly this reason — no equivalent "mint a passkeySetupToken without
 * sending email" endpoint exists yet. Adding one would mean modifying bridge-api
 * application source (test.controller.ts / test-data.service.ts), which is out
 * of scope for this test-only change. Flagged back in the test-writer report.
 *
 * Registration below instead drives the real registration-options /
 * verify-registration endpoints directly from the page (same origin, same
 * virtual authenticator, same real ceremony) using a `forgotPasswordToken`.
 * PasskeysController's getRegistrationOptions/verifyRegistration both accept
 * `forgotPasswordToken || passkeySetupToken` — this is an already-shipped,
 * production code path (see PasskeysChallengeError / getCredentialsConfigFromForgotPasswordToken),
 * not something invented for this test — and it runs through the exact same
 * resolveRpContext / generateRegistrationOptionsJson / verifyRegistrationResponse
 * code as the passkeySetupToken path would. It just doesn't click through the
 * PasskeySetup.svelte component itself.
 *
 * Authentication DOES drive the real PasskeyLogin.svelte component end to end —
 * getPasskeyAuthOptions() needs no token at all (SDK mode identifies the app via
 * the x-app-id header only), so there's no email/token gap on that side.
 */

import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT, LONG_TIMEOUT } from '../../fixtures/timeouts';

test.describe('SDK Passkey Ceremony (real WebAuthn)', () => {
  test('register a passkey via a real ceremony, then sign in with it via PasskeyLogin', async ({
    page,
    testUser,
    envConfig,
    testDataClient,
  }) => {
    const apiBaseUrl = envConfig.apiBaseUrl;
    if (!apiBaseUrl) {
      throw new Error(
        `envConfig.apiBaseUrl is not set for environment "${envConfig.name}" — this test needs a direct ` +
          `bridge-api URL to drive the registration-options/verify-registration ceremony.`,
      );
    }

    // 1. Attach a resident-key-capable CDP virtual authenticator BEFORE any
    // WebAuthn call, so both the create() and get() ceremonies below are
    // answered by it instead of prompting for a real device.
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
      await page.goto(envConfig.baseUrl);
      await page.waitForLoadState('networkidle');

      // 2. Mint a real, valid token for this user without going through email
      // delivery (see file header for why this is a forgotPasswordToken, not
      // a passkeySetupToken).
      const { token } = await testDataClient.getPasswordResetLink(testUser.email, envConfig.baseUrl);

      // 3. Real ceremony from the page: real registration-options fetch, real
      // navigator.credentials.create() (answered by the virtual authenticator),
      // real verify-registration fetch. All from the demo's own origin — this
      // is the localhost RP-ID path end to end.
      const regResult = await page.evaluate(
        async ({ apiBaseUrl, appId, token }) => {
          const b64urlToBuf = (b64url: string): ArrayBuffer => {
            const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
            const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
            const str = atob(b64 + pad);
            const buf = new ArrayBuffer(str.length);
            const bytes = new Uint8Array(buf);
            for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
            return buf;
          };
          const bufToB64url = (buf: ArrayBuffer): string => {
            const bytes = new Uint8Array(buf);
            let str = '';
            for (const b of bytes) str += String.fromCharCode(b);
            return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
          };

          const optsRes = await fetch(
            `${apiBaseUrl}/auth/passkeys/registration-options?forgotPasswordToken=${encodeURIComponent(token)}`,
            { headers: { 'x-app-id': appId } },
          );
          const optsBody = await optsRes.json();
          if (!optsRes.ok) {
            return { ok: false, step: 'registration-options', status: optsRes.status, body: optsBody };
          }

          const publicKey: any = {
            ...optsBody,
            challenge: b64urlToBuf(optsBody.challenge),
            user: { ...optsBody.user, id: b64urlToBuf(optsBody.user.id) },
            excludeCredentials: (optsBody.excludeCredentials || []).map((c: any) => ({
              ...c,
              id: b64urlToBuf(c.id),
            })),
          };

          const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential;
          const response = credential.response as AuthenticatorAttestationResponse;

          const attestationResponse = {
            id: credential.id,
            rawId: bufToB64url(credential.rawId),
            type: credential.type,
            response: {
              clientDataJSON: bufToB64url(response.clientDataJSON),
              attestationObject: bufToB64url(response.attestationObject),
              transports: response.getTransports ? response.getTransports() : [],
            },
            clientExtensionResults: credential.getClientExtensionResults(),
          };

          const verifyRes = await fetch(
            `${apiBaseUrl}/auth/passkeys/verify-registration?forgotPasswordToken=${encodeURIComponent(token)}`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                ...attestationResponse,
                appId,
                sdkChallengeToken: optsBody.sdkChallengeToken,
              }),
            },
          );
          const verifyBody = await verifyRes.json().catch(() => ({}));
          return { ok: verifyRes.ok, step: 'verify-registration', status: verifyRes.status, body: verifyBody };
        },
        { apiBaseUrl, appId: envConfig.appId, token },
      );

      expect(
        regResult.ok,
        `Real passkey registration ceremony failed at ${regResult.step} (status ${regResult.status}): ${JSON.stringify(regResult.body)}`,
      ).toBe(true);
      expect(regResult.body.verified).toBe(true);

      // 4. Real UI ceremony: drive PasskeyLogin.svelte's actual "Sign in with
      // Passkeys" button. It calls the real getPasskeyAuthOptions() +
      // navigator.credentials.get() + authenticateWithPasskey() — the virtual
      // authenticator answers with the resident credential just registered.
      await page.goto('/auth/login');
      await page.waitForLoadState('networkidle');
      await page.locator('#login-email').waitFor({ state: 'visible', timeout: MED_TIMEOUT });

      const passkeyBtn = page.locator('[data-bridge-passkey-login]');
      await expect(passkeyBtn).toBeVisible({ timeout: MED_TIMEOUT });
      await passkeyBtn.click();

      // Success = real navigation to the protected page showing this user's profile —
      // not just a 200 from verify-authentication.
      await page.waitForURL('**/protected', { timeout: LONG_TIMEOUT });
      await expect(page.getByText('You are currently authenticated')).toBeVisible({ timeout: MED_TIMEOUT });
      // Both the Email and Username fields render this same address — scope to
      // the Email row specifically so the locator doesn't match two elements.
      await expect(page.getByText(`Email: ${testUser.email}`)).toBeVisible({ timeout: MED_TIMEOUT });
    } finally {
      await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId }).catch(() => {});
    }
  });
});
