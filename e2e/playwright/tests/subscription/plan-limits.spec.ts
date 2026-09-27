/**
 * Plan limits in the UI (TBP-703).
 *
 * Level 0 — the page has no Bridge code. The demo's stand-in backend
 * (demo/src/routes/api/demo-backend/[action]/+server.ts) answers a real HTTP
 * request with the exact 402 bridge-nestjs's @RequireQuota sends at the cap;
 * the real SDK in the browser sees it and <BridgeBootstrap> opens the upgrade
 * dialog. Nothing is intercepted by Playwright on this path: the 402 is a real
 * response through the real global fetch / bridgeFetch.
 *
 * Level 1 — <QuotaGate> and <Entitled> against the real bridge-api. The one
 * thing this suite cannot do is put a hard quota at its cap on a plan (the
 * test-data endpoints take no quotas), so the at-cap and held-loading cases
 * answer `GET /usage/quota/:metric` from the page route in the server's shape
 * (as usage-quota.spec.ts does).
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';

const quotaPath = (metric: string) => `**/usage/quota/${encodeURIComponent(metric)}`;

async function openPlanLimits(page: Page): Promise<void> {
  await page.goto('/plan-limits');
  await expect(page.getByTestId('create-ticket')).toBeVisible({ timeout: LONG_TIMEOUT });
}

const dialog = (page: Page) => page.getByRole('dialog', { name: "You've reached your plan's limit" });

test.describe('Level 0 — the upgrade dialog with no code on the page (TBP-703)', () => {
  test('a 402 QUOTA_EXCEEDED from the app’s backend (plain fetch) opens the dialog naming the metric; Upgrade goes to the fix route', async ({
    authenticatedPage: page,
  }) => {
    await openPlanLimits(page);
    await expect(dialog(page)).toBeHidden();

    const refused = page.waitForResponse((r) => r.url().endsWith('/api/demo-backend/tickets'));
    await page.getByTestId('create-ticket').click();
    const res = await refused;
    expect(res.status()).toBe(402);
    expect(await res.json()).toMatchObject({ code: 'QUOTA_EXCEEDED', metric: 'tickets', used: 3, limit: 3 });

    // The page itself still got the 402 — the SDK only watched it.
    await expect(page.getByTestId('last-status')).toHaveText('402');

    const d = dialog(page);
    await expect(d).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(d).toContainText('used 3 of 3 tickets on its current plan');
    const cta = d.getByRole('link', { name: 'Upgrade plan' });
    await expect(cta).toHaveAttribute('href', '/subscription');

    await cta.click();
    await page.waitForURL((url) => url.pathname === '/subscription', { timeout: LONG_TIMEOUT });
    await expect(dialog(page)).toBeHidden();
  });

  test('the same through bridgeFetch, and the dialog follows the backend’s own fix path', async ({
    authenticatedPage: page,
  }) => {
    await openPlanLimits(page);

    const refused = page.waitForResponse((r) => r.url().endsWith('/api/demo-backend/exports'));
    await page.getByTestId('export-report').click();
    const res = await refused;
    expect(res.status()).toBe(402);
    // bridgeFetch sent the signed-in user's token to the app's backend.
    expect(res.request().headers()['authorization']).toMatch(/^Bearer .+/);

    const d = dialog(page);
    await expect(d).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(d).toContainText('used 10 of 10 exports');
    await expect(d.getByRole('link', { name: 'Upgrade plan' })).toHaveAttribute('href', '/subscription?from=exports');

    // "Not now" closes it and leaves the user where they were.
    await d.getByRole('button', { name: 'Not now' }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(page).toHaveURL(/\/plan-limits$/);
  });

  test('a 402 that is not a plan limit (card declined) leaves the dialog shut — and the next real refusal still opens it', async ({
    authenticatedPage: page,
  }) => {
    await openPlanLimits(page);

    await page.getByTestId('declined-card').click();
    await expect(page.getByTestId('last-status')).toHaveText('402', { timeout: MED_TIMEOUT });
    // Give a wrongly-opened dialog the same chance the real one gets below.
    await page.getByTestId('create-allowed').click();
    await expect(page.getByTestId('created')).toHaveText('1', { timeout: MED_TIMEOUT });
    await expect(dialog(page)).toBeHidden();

    // Control: the watcher was live all along.
    await page.getByTestId('create-ticket').click();
    await expect(dialog(page)).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('billing.upgradeDialog: false — the same refusal opens no dialog', async ({ authenticatedPage: page }) => {
    await page.goto('/plan-limits');
    await page.evaluate(() => localStorage.setItem('bridge:upgradeDialog', 'false'));
    try {
      await openPlanLimits(page); // reload with the switch read by bridgeBootstrap
      await page.getByTestId('create-ticket').click();
      await expect(page.getByTestId('last-status')).toHaveText('402', { timeout: MED_TIMEOUT });
      // Wait for a later request to settle so a late-opening dialog would have shown.
      await page.getByTestId('create-allowed').click();
      await expect(page.getByTestId('created')).toHaveText('1', { timeout: MED_TIMEOUT });
      await expect(page.locator('[data-bridge-upgrade-dialog]')).toHaveCount(0);
    } finally {
      await page.evaluate(() => localStorage.removeItem('bridge:upgradeDialog'));
    }

    // Control: the same page with the switch gone does open it.
    await openPlanLimits(page);
    await page.getByTestId('create-ticket').click();
    await expect(dialog(page)).toBeVisible({ timeout: MED_TIMEOUT });
  });
});

test.describe('Level 1 — <QuotaGate> and <Entitled> (TBP-703)', () => {
  async function gateOn(page: Page, metric: string): Promise<void> {
    await openPlanLimits(page);
    await page.getByTestId('gate-metric').fill(metric);
  }

  test('QuotaGate keeps the action ENABLED while the quota loads, then disables it at a hard cap with an Upgrade link', async ({
    authenticatedPage: page,
  }) => {
    const metric = `e2e_gate_${Date.now().toString(36)}`;
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let asked = false;
    await page.route(quotaPath(metric), async (route) => {
      asked = true;
      await held;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ metric, used: 5, limit: 5, remaining: 0, warningLevel: 'critical', policy: 'hard', kind: 'gauge' }),
      });
    });

    await gateOn(page, metric);
    const gate = page.locator(`[data-bridge-quota-gate][data-metric="${metric}"]`);
    const action = page.getByTestId('gated-action');

    await expect.poll(() => asked, { timeout: MED_TIMEOUT }).toBe(true);
    await expect(gate).toHaveAttribute('data-state', 'loading');
    await expect(action).toBeEnabled();

    release();

    await expect(gate).toHaveAttribute('data-state', 'at-limit', { timeout: MED_TIMEOUT });
    await expect(action).toBeDisabled();
    await expect(gate.getByRole('status')).toContainText(`You've used all 5 ${metric} on your plan.`);
    await expect(gate.getByRole('link', { name: 'Upgrade' })).toHaveAttribute('href', '/subscription');
  });

  test('QuotaGate on a metric the real server puts no limit on stays enabled', async ({ authenticatedPage: page }) => {
    const metric = `e2e_nolimit_${Date.now().toString(36)}`;
    await gateOn(page, metric);
    const gate = page.locator(`[data-bridge-quota-gate][data-metric="${metric}"]`);
    await expect(gate).toHaveAttribute('data-state', 'unlimited', { timeout: MED_TIMEOUT });
    await expect(page.getByTestId('gated-action')).toBeEnabled();
  });

  test('Entitled shows the fallback for a key the plan lacks — once Bridge has answered, never the feature', async ({
    authenticatedPage: page,
  }) => {
    await openPlanLimits(page);
    const key = `e2e_not_on_any_plan_${Date.now().toString(36)}`;
    await page.getByTestId('entitled-key').fill(key);

    const entitled = page.getByTestId('entitled');
    await expect(page.getByTestId('entitled-fallback')).toBeVisible({ timeout: LONG_TIMEOUT });
    await expect(entitled).toContainText(`${key} is on a higher plan.`);
    await expect(page.getByTestId('entitled-feature')).toHaveCount(0);
    await expect(page.getByTestId('entitled-loading')).toHaveCount(0);
  });
});
