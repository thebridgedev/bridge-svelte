/**
 * Quota numbers, entitlements and self-reported usage from the Svelte plugin
 * alone (TBP-697).
 *
 * The demo's /usage-quota page is written the way the billing guide teaches:
 * `useQuota(metric)`, `$entitlements.can(key)` and `bridge.usage.set/report`,
 * all imported from bridge-svelte. This spec drives the real SDK in the browser
 * against the real bridge-api.
 *
 * What only a browser can show: the page renders "Loading…" — not "0 of 0" —
 * while Bridge has not answered, and switches on its own when the answer lands.
 * And the usage calls reach Bridge as the requests Bridge expects.
 *
 * The test app's plans carry no quota for the metrics used here (a fresh metric
 * name per run), so the server's real answer for them is "no limit". The one
 * test that needs numbers answers `GET /usage/quota/:metric` from the page
 * route with a gauge snapshot in the server's shape — this suite has no way to
 * put a gauge quota on a plan (the test-data endpoints take no quotas).
 */

import type { Page, Route } from '@playwright/test';
import { test, expect } from '../../fixtures/auth';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';

const quotaPath = (metric: string) => `**/usage/quota/${encodeURIComponent(metric)}`;

/** Open /usage-quota watching `metric` (the page defaults to 'projects'). */
async function openFor(page: Page, metric: string): Promise<void> {
  await page.goto('/usage-quota');
  const input = page.getByTestId('metric-input');
  await expect(input).toBeVisible({ timeout: LONG_TIMEOUT });
  await input.fill(metric);
}

test.describe('useQuota / entitlements / bridge.usage (TBP-697)', () => {
  test('shows Loading — never a zero — until Bridge answers, then Bridge’s real answer', async ({
    authenticatedPage: page,
  }) => {
    const metric = `e2e_unlimited_${Date.now().toString(36)}`;

    // Hold the quota read so the before-answer state is observable.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let seen: Route | undefined;
    await page.route(quotaPath(metric), async (route) => {
      seen = route;
      await held;
      await route.continue();
    });

    await openFor(page, metric);

    const quota = page.getByTestId('quota');
    await expect.poll(() => seen !== undefined, { timeout: MED_TIMEOUT }).toBe(true);
    await expect(quota).toHaveAttribute('data-state', 'loading');
    await expect(page.getByTestId('quota-summary')).toHaveText('Loading…');
    await expect(quota).not.toContainText(/\d/);

    // The read carries the signed-in user's token.
    expect(seen!.request().headers()['authorization']).toMatch(/^Bearer .+/);

    release();

    // The real server has no quota on this metric: "no limit", not "0 of 0".
    await expect(quota).toHaveAttribute('data-state', 'unlimited', { timeout: MED_TIMEOUT });
    await expect(page.getByTestId('quota-summary')).toHaveText(`No limit on ${metric} for this plan`);
  });

  test('renders a gauge quota’s numbers', async ({ authenticatedPage: page }) => {
    const metric = `e2e_gauge_${Date.now().toString(36)}`;
    await page.route(quotaPath(metric), (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          metric,
          used: 8,
          limit: 10,
          remaining: 2,
          warningLevel: 'approaching',
          policy: 'hard',
          kind: 'gauge',
        }),
      }),
    );

    await openFor(page, metric);

    const quota = page.getByTestId('quota');
    await expect(quota).toHaveAttribute('data-state', 'limited', { timeout: MED_TIMEOUT });
    await expect(page.getByTestId('quota-summary')).toHaveText(`8 of 10 ${metric}`);
    await expect(page.getByTestId('quota-remaining')).toHaveText('2');
    await expect(page.getByTestId('quota-kind')).toHaveText('gauge');
    await expect(page.getByTestId('quota-warning')).toHaveText('approaching');
  });

  test('bridge.usage.set stores the gauge value at Bridge; report sends a counter event', async ({
    authenticatedPage: page,
  }) => {
    const metric = `e2e_set_${Date.now().toString(36)}`;
    await openFor(page, metric);
    await page.getByTestId('gauge-value').fill('7');

    const put = page.waitForResponse(
      (r) => r.request().method() === 'PUT' && r.url().endsWith(`/usage/gauge/${metric}`),
      { timeout: MED_TIMEOUT },
    );
    await page.getByRole('button', { name: `bridge.usage.set('${metric}', 7)` }).click();
    const res = await put;

    expect(res.status(), await res.text()).toBeLessThan(300);
    expect(res.request().postDataJSON()).toEqual({ value: 7 });
    expect(res.request().headers()['authorization']).toMatch(/^Bearer .+/);
    await expect(page.getByTestId('set-result')).toHaveAttribute('data-state', 'stored');

    const ingest = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/usage/ingest'),
      { timeout: MED_TIMEOUT },
    );
    await page.getByRole('button', { name: `bridge.usage.report('${metric}')` }).click();
    const ingested = await ingest;
    expect(ingested.status(), await ingested.text()).toBeLessThan(300);
    expect(ingested.request().postData() ?? '').toContain(metric);
  });

  test('$entitlements answers for the session: a key the plan does not grant reads as denied, not loading', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/usage-quota');
    await page.getByTestId('entitlement-input').fill(`e2e_not_on_any_plan_${Date.now().toString(36)}`);

    const entitlement = page.getByTestId('entitlement');
    await expect(entitlement).toHaveAttribute('data-state', 'denied', { timeout: LONG_TIMEOUT });
    await expect(entitlement).toContainText('Your plan does not include');
  });
});
