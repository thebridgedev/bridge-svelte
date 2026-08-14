/**
 * SDK Passkey Origin Validation (live HTTP) Tests — TBP-443
 *
 * Hits bridge-api's real running passkeys options endpoint directly (Playwright's
 * `request` fixture — no browser, no mocks) to assert the origin-validation half
 * of TBP-443's per-request RP-ID resolution:
 *   - Origin header inside the app's allowedOrigins  -> 200, rpId derived from it
 *   - Origin header NOT in the app's allowedOrigins   -> 403 "Origin not allowed"
 *
 * passkeys.controller.spec.ts already asserts this with NestJS providers (and
 * AccountApiClientService) mocked out — this asserts it against the live HTTP
 * server, with a real app document read from the real DB.
 *
 * Uses a dedicated test app seeded here with an explicit, non-wildcard
 * allowedOrigins list rather than the shared SDK test app
 * (BRIDGE_SVELTE_TEST_DASHBOARD), whose allowedOrigins is a blanket
 * `http://localhost:*` (set by pre-setup.ts for SDK auth generally) and so can
 * never produce a "not allowed" case.
 *
 * GET /auth/passkeys/authentication-options is used (rather than
 * registration-options) because it needs no forgotPasswordToken/passkeySetupToken —
 * only the x-app-id header — so origin validation is exercised in isolation from
 * any user/token setup.
 */

import { test, expect } from '../../fixtures/auth';

const ALLOWED_ORIGIN = 'http://localhost:3208';
const DISALLOWED_ORIGIN = 'http://evil.example.com';
const TEST_APP_DOMAIN = 'BRIDGE_SVELTE_PASSKEY_ORIGIN_TEST';

test.describe('SDK Passkey Origin Validation (live HTTP)', () => {
  let appId: string;
  let apiBaseUrl: string;

  test.beforeAll(async ({ envConfig, request }) => {
    if (!envConfig.apiBaseUrl) {
      throw new Error(`envConfig.apiBaseUrl is not set for environment "${envConfig.name}"`);
    }
    apiBaseUrl = envConfig.apiBaseUrl;

    // Seed a dedicated app with an explicit, non-wildcard allowedOrigins list.
    const setupRes = await request.post(
      `${envConfig.testDataApiUrl}/account/test/playwright/setup-test-app`,
      {
        headers: { 'x-playwright-api-key': envConfig.testDataApiKey },
        data: {
          domain: TEST_APP_DOMAIN,
          appName: 'Bridge Svelte Passkey Origin Test',
          ownerEmail: 'playwright-passkey-origin-test@thebridge.io',
          ownerPassword: 'helloworld',
        },
      },
    );
    expect(setupRes.ok(), await setupRes.text()).toBe(true);
    ({ appId } = await setupRes.json());

    const configureRes = await request.post(
      `${envConfig.testDataApiUrl}/account/test/playwright/configure-app`,
      {
        headers: { 'x-playwright-api-key': envConfig.testDataApiKey },
        data: { appDomain: TEST_APP_DOMAIN, allowedOrigins: [ALLOWED_ORIGIN] },
      },
    );
    expect(configureRes.ok(), await configureRes.text()).toBe(true);
  });

  test.afterAll(async ({ envConfig, request }) => {
    await request
      .delete(`${envConfig.testDataApiUrl}/account/test/playwright/test-app`, {
        headers: { 'x-playwright-api-key': envConfig.testDataApiKey },
        data: { domain: TEST_APP_DOMAIN },
      })
      .catch(() => {});
  });

  test('Origin in allowedOrigins -> 200 with rpId derived from that origin', async ({ request }) => {
    const res = await request.get(`${apiBaseUrl}/auth/passkeys/authentication-options`, {
      headers: { 'x-app-id': appId, Origin: ALLOWED_ORIGIN },
    });

    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    // deriveRpIdFromOrigin special-cases any *.localhost / localhost hostname to 'localhost'.
    expect(body.rpId).toBe('localhost');
  });

  test('Origin NOT in allowedOrigins -> 403 Origin not allowed', async ({ request }) => {
    const res = await request.get(`${apiBaseUrl}/auth/passkeys/authentication-options`, {
      headers: { 'x-app-id': appId, Origin: DISALLOWED_ORIGIN },
    });

    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.message).toContain('Origin not allowed');
  });
});
