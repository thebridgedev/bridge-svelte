/**
 * SDK Magic Link round trip — TBP-682 regression
 *
 * WHY THIS EXISTS
 * ---------------
 * Magic link had coverage on both halves and none on their meeting point, so a
 * 404 lived between them undetected:
 *
 *   - `sdk-magic-link.spec.ts` proves the request form submits and reports
 *     "check your email". It never looks at where the link points.
 *   - bridge-api's `magic-link.controller.spec.ts` proves the controller
 *     composes `{successUrl}?bridge_magic_link_token=<token>` and refuses a
 *     foreign `successUrl`. It never looks at whether the host app serves that
 *     page or does anything with that query param.
 *   - bridge-api's `e2e/playwright/tests/auth/magic-link-flow.spec.ts` drives a
 *     link from `GET /auth/test/playwright/magic-link`, which composes the
 *     LEGACY cloud-views form (`/auth/magic-link/login?t=`) in its own code —
 *     a second implementation, so it cannot catch drift in the real one.
 *
 * Nothing asserted that the page the SDK nominates is a page the demo actually
 * serves and that knows what to do with `?bridge_magic_link_token=`. That is
 * exactly what broke, and it is what this spec covers.
 *
 * WHAT IS ASSERTED, AND FROM WHERE
 * --------------------------------
 * The `successUrl` is never written by this spec. It is read back off the wire
 * from the POST the SDK actually made (`request.postDataJSON()`), so the value
 * under test is the one `auth-core` derived at runtime from the page the form
 * was on. The API's acceptance of it is read off the same exchange's response.
 *
 * KNOWN GAP — the emailed URL itself is not observable on a local stack
 * --------------------------------------------------------------------
 * bridge-api logs the composed link as `Magic link sent to <user>. Link: <url>`
 * via `Logger.debug`, and local dev drops every debug record before it reaches
 * a sink: `buildTransport()` in `bridge-api-shared/logging/pino-options.util.ts`
 * declares its pino targets with no `level`, and pino's multistream defaults an
 * unlevelled target to `info` — so `LOG_LEVEL=debug` in `config/.env` has no
 * effect and there are zero debug records in the running process. The mail goes
 * out through real SES, and the email event log (`POST /communication/email/log`)
 * stores only the envelope, not the body. So the last hop — appending the token
 * to the accepted `successUrl` — is reproduced here from the server-minted token
 * rather than read back from the server's own output. Everything else on the
 * path is server-produced.
 */

import { expect, readBridgeTokens, test } from '../../fixtures/auth';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';
import type { Page } from '@playwright/test';

/**
 * The SDK's send-magic-link call, told apart from `/auth/magic-link/authenticate`
 * (the token exchange), which shares the prefix and fires on the same page.
 */
function isSendMagicLinkCall(url: string): boolean {
  return new URL(url).pathname.endsWith('/auth/magic-link');
}

/** The page identity `auth-core` defaults `successUrl` to: origin + pathname. */
function pageIdentity(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

/**
 * Drive the real magic-link request on the demo's sign-in page and return the
 * `successUrl` the SDK put on the wire plus the API's verdict on it.
 *
 * Returns the observed values rather than asserting on them so each test states
 * its own expectations — no shared assertions, no cross-test state.
 */
async function requestMagicLinkFromSignInPage(
  page: Page,
  email: string,
): Promise<{ signInPageIdentity: string; successUrl: unknown; status: number }> {
  await page.goto('/auth/login');

  const signInPageIdentity = pageIdentity(page.url());

  await page.getByRole('button', { name: 'Sign in with Magic Link' }).click();

  const emailInput = page.locator('#magic-link-email');
  await emailInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  await emailInput.fill(email);

  const requestPromise = page.waitForRequest(
    (req) => req.method() === 'POST' && isSendMagicLinkCall(req.url()),
    { timeout: MED_TIMEOUT },
  );
  const responsePromise = page.waitForResponse(
    (res) => res.request().method() === 'POST' && isSendMagicLinkCall(res.url()),
    { timeout: MED_TIMEOUT },
  );

  await page.getByRole('button', { name: 'Send magic link' }).click();

  const request = await requestPromise;
  const response = await responsePromise;

  const successUrl = request.postDataJSON()?.successUrl;
  console.log(`[magic-link] SDK nominated successUrl: ${successUrl} (API ${response.status()})`);

  return {
    signInPageIdentity,
    successUrl,
    status: response.status(),
  };
}

test.describe('SDK Magic Link round trip', () => {
  test('the SDK nominates the sign-in page it is on, and the API accepts it', async ({
    page,
    testUser,
  }) => {
    const { signInPageIdentity, successUrl, status } = await requestMagicLinkFromSignInPage(
      page,
      testUser.email,
    );

    // The link the platform composes is `{successUrl}?bridge_magic_link_token=…`,
    // so this value alone decides whether the email lands on a real page.
    expect(successUrl).toBe(signInPageIdentity);

    // Accepted, i.e. inside the app's allowed origins — the TBP-682 server check
    // refuses with 400 otherwise, and no mail is sent.
    expect([200, 201]).toContain(status);

    await expect(page.locator('[data-bridge-alert][data-variant="success"]')).toBeVisible({
      timeout: MED_TIMEOUT,
    });
    await expect(page.locator('[data-bridge-alert][data-variant="error"]')).not.toBeVisible();
  });

  test('the nominated page is served by the demo and signs the user in from the token', async ({
    page,
    testUser,
    testDataClient,
    envConfig,
  }) => {
    const { successUrl, status } = await requestMagicLinkFromSignInPage(page, testUser.email);
    expect([200, 201]).toContain(status);
    expect(typeof successUrl).toBe('string');

    // The demo must actually serve the page the SDK nominated. A 404 here is the
    // original bug, and it is invisible to either half's own tests.
    const served = await page.request.get(successUrl as string);
    expect(served.status()).toBe(200);

    // Last hop: present the token at that page exactly as the emailed link does.
    // The token is minted by bridge-api (same `createMagicLinkToken` the mailed
    // link uses); only the query-param assembly is reproduced here — see the
    // KNOWN GAP note at the top of this file.
    const { token } = await testDataClient.getMagicLinkToken(envConfig.appId, testUser.email);
    const composed = new URL(successUrl as string);
    composed.searchParams.set('bridge_magic_link_token', token);

    await page.goto(composed.toString());

    // The demo routes a completed SDK login to /protected.
    await page.waitForURL((url) => url.pathname.startsWith('/protected'), {
      timeout: LONG_TIMEOUT,
    });

    const tokens = await readBridgeTokens(page);
    expect(tokens?.accessToken).toBeTruthy();

    await expect(page.locator('[data-bridge-alert][data-variant="error"]')).not.toBeVisible();
  });

  test('a successUrl on a foreign origin is refused instead of emailed', async ({
    page,
    testUser,
    envConfig,
  }) => {
    if (!envConfig.apiBaseUrl) {
      throw new Error(
        `envConfig.apiBaseUrl is not set for environment "${envConfig.name}" — this test needs a ` +
          `direct bridge-api URL to post the SDK's own request shape with an attacker successUrl.`,
      );
    }

    // On the demo's own origin, so the request carries the same Origin header the
    // SDK's would. No UI can supply a foreign successUrl, so the SDK's request
    // shape is posted directly — the refusal under test is the API's.
    await page.goto('/auth/login');

    const result = await page.evaluate(
      async ({ apiBaseUrl, username, appId }) => {
        const res = await fetch(`${apiBaseUrl}/auth/magic-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username,
            mode: 'sdk',
            appId,
            successUrl: 'https://magic-link-attacker.example/collect',
          }),
        });
        return { status: res.status, body: await res.text() };
      },
      { apiBaseUrl: envConfig.apiBaseUrl, username: testUser.email, appId: envConfig.appId },
    );

    // A genuine Bridge token delivered to a host the attacker controls is the
    // whole point of the check — the answer must be a refusal, not a sent link.
    expect(result.status).toBe(400);
    expect(result.body).toContain('NBLOCKS_INVALID_REDIRECT_URI_ERROR');
  });
});
