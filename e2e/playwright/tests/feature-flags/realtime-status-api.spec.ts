import { test, expect } from '../../fixtures/auth';
import { LONG_TIMEOUT } from '../../fixtures/timeouts';

/**
 * The public realtime status API, end to end (TBP-642 / TBP-644).
 *
 * TBP-642 asks for a status a consuming page can react to —
 * `realtime.status` plus `onStatusChange`, exported from every framework SDK —
 * so an app can surface "live updates are down" instead of silently missing
 * plan changes, entitlements and flag flips. bridge-svelte exports that as the
 * `realtimeStatus` store (plus `realtimeStatusDetail` and
 * `onBridgeRealtimeStatus`), and the demo renders it into
 * `[data-testid="rt-status"]`.
 *
 * Until now nothing asserted that wiring end to end: the store had unit tests
 * and the demo had a pill, but no test confirmed a real connection against a
 * real backend actually drives the DOM. So a refactor that left the store
 * permanently on its initial `idle` value would have shipped green.
 *
 * ── What this spec deliberately does NOT cover ──────────────────────────────
 *
 * TBP-642's headline acceptance criterion is about a FAILURE EPISODE: an
 * `UnauthorizedException` 401 at connect must be classified apart from a
 * transient fault, retried once with a fresh token, then settle into a
 * terminal `unauthorized` state having logged exactly ONE console message for
 * the episode rather than one per retry (the incident logged 101).
 *
 * That is not reachable from this demo, and the reason is the transport, not
 * the test. The reported failure is AppSync-specific — `connection_error` /
 * `UnauthorizedException` from AWS AppSync Events, whose per-channel auth runs
 * in a Lambda authorizer. The local stack does not use AppSync:
 *
 *     GET /realtime/config ->
 *       {"kind":"centrifugo","endpoint":"ws://localhost:8000/connection/websocket", ...}
 *
 * Centrifugo authorizes over `POST /realtime/authorize` instead, so the code
 * path that classifies the AppSync 401 is never entered locally. Forcing a
 * failure by blocking `/realtime/config` from Playwright does not stand in for
 * it either: that leaves the status at `idle` (never started) rather than
 * producing a connect-time auth rejection, so asserting on it would be
 * inventing a scenario and calling it the ticket's. Verifying the episode
 * behaviour needs a stage/prod run against the AppSync transport.
 */

const statusPill = (page: import('@playwright/test').Page) =>
  page.locator('[data-testid="rt-status"]');

/** The states TBP-642 defines for the public API. */
const PUBLIC_STATES = ['idle', 'connecting', 'open', 'degraded', 'unauthorized', 'offline'];

test.describe('Realtime status is public and the page reacts to it (TBP-642)', () => {
  test('the status store reaches `open` against a live backend and renders it', async ({
    page,
  }) => {
    await page.goto('/');

    const pill = statusPill(page);
    await expect(pill).toBeVisible({ timeout: LONG_TIMEOUT });

    // The connection is real (Centrifugo on the local stack), so this asserts
    // the whole chain: transport -> auth-core status -> bridge-svelte store ->
    // the consuming page's DOM. A store stuck on its initial value fails here.
    await expect(pill).toHaveText('open', { timeout: LONG_TIMEOUT });
  });

  test('the rendered status is one of the documented states, never a placeholder', async ({
    page,
  }) => {
    // Guards the API's shape rather than one value: the AC names the state set,
    // and a page rendering `undefined`, `[object Object]` or an internal label
    // would be a broken public contract even while "showing a status".
    await page.goto('/');

    const pill = statusPill(page);
    await expect(pill).toBeVisible({ timeout: LONG_TIMEOUT });

    const text = (await pill.textContent())?.trim() ?? '';
    expect(
      PUBLIC_STATES,
      `rendered realtime status ${JSON.stringify(text)} is not one of the ` +
        `states TBP-642 defines`,
    ).toContain(text);
  });
});
