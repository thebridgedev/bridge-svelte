/**
 * TBP-756 — a feature that is off because of the plan sells the upgrade, but
 * nothing opens by itself (owner decision 2026-09-28):
 *   - reaching a plan-gated route opens the upgrade dialog (first load:
 *     redirect to the rule's redirectTo first; clicking in: stay put);
 *   - a page that merely renders a hidden feature opens nothing;
 *   - the opt-in `upgrade` word shows an inline prompt, which opens the dialog
 *     only on click.
 *
 * The flag `e2e-plan-gated` is seeded in this worker's app with a rule on a
 * plan feature no plan includes (`bridge:billing.entitlement.<key> eq true`),
 * so for every user it is off with reason `plan`. The demo's fixture rules
 * gate /feature-upgrade/gated on it (redirectTo /feature-upgrade).
 */

import { test, expect } from '../../fixtures/auth';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';

const FLAG = 'e2e-plan-gated';
const FEATURE = 'e2e_plan_gated_feature';

const featureDialog = (page: import('@playwright/test').Page) =>
  page.locator('dialog[data-bridge-upgrade-dialog][data-variant="feature"]');

test.describe('Upgrade dialog for a plan-gated feature (TBP-756)', () => {
  test.beforeEach(async ({ testDataClient, envConfig }) => {
    const { token } = await testDataClient.generateApiToken(['FLAG_DELETE']);
    await testDataClient.upsertFlag(token, {
      key: FLAG,
      description: 'TBP-756 e2e: off for every workspace because of the plan',
      state: 'on-with-rule',
      valueType: 'boolean',
      onValue: true,
      offValue: false,
      rule: {
        branches: [
          {
            conditions: [{ attribute: `bridge:billing.entitlement.${FEATURE}`, operator: 'eq', values: [true] }],
            returnValue: true,
          },
        ],
        otherwiseValue: false,
        rolloutPct: 100,
      },
    });
    // Bridge serves the new rule once its flag cache picked it up.
    await expect
      .poll(async () => testDataClient.anonymousFlagReason(envConfig.appId, FLAG), { timeout: LONG_TIMEOUT })
      .toBe('plan');
  });

  test('first load of a plan-gated route redirects, then opens the upgrade dialog naming the feature', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/feature-upgrade/gated');
    await page.waitForURL((url) => url.pathname === '/feature-upgrade', { timeout: LONG_TIMEOUT });

    const dialog = featureDialog(page);
    await expect(dialog).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(dialog).toHaveAttribute('data-feature', FEATURE);
    await expect(dialog).toContainText("This feature isn't on your plan");
    await expect(page.getByTestId('gated-content')).toHaveCount(0);

    await dialog.getByRole('button').first().click();
    await expect(dialog).toBeHidden({ timeout: MED_TIMEOUT });
  });

  test('a page with a hidden plan-gated feature opens nothing; the opt-in prompt opens it on click', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/feature-upgrade');

    // The opt-in prompt appearing proves the flag was evaluated with reason plan.
    const prompt = page.locator(`[data-bridge-feature-upgrade="${FLAG}"]`);
    await expect(prompt).toBeVisible({ timeout: LONG_TIMEOUT });

    // The same feature with no fallback: hidden, and no dialog.
    await expect(page.getByTestId('hidden-feature-on')).toHaveCount(0);
    await expect(page.getByTestId('prompted-feature-on')).toHaveCount(0);
    await expect(page.locator('dialog[data-bridge-upgrade-dialog][open]')).toHaveCount(0);

    await prompt.click();
    const dialog = featureDialog(page);
    await expect(dialog).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(dialog).toHaveAttribute('data-feature', FEATURE);
  });

  test('clicking into a plan-gated route keeps the visitor on their page and opens the dialog', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/feature-upgrade');
    await expect(page.locator(`[data-bridge-feature-upgrade="${FLAG}"]`)).toBeVisible({ timeout: LONG_TIMEOUT });
    await expect(page.locator('dialog[data-bridge-upgrade-dialog][open]')).toHaveCount(0);

    await page.getByTestId('gated-link').click();

    const dialog = featureDialog(page);
    await expect(dialog).toBeVisible({ timeout: LONG_TIMEOUT });
    await expect(page).toHaveURL(/\/feature-upgrade$/);
    await expect(page.getByTestId('gated-content')).toHaveCount(0);
  });
});
