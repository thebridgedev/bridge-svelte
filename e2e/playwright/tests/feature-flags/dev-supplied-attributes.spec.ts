/**
 * TBP-178 — dev passes per-call attributes to flag evaluation.
 *
 * Exercises the path:
 *   bridge.flag('enterprise-feature', false, { attributes: { plan: 'X' } })
 *     → SDK merges per-call attrs with provider attrs (dev wins on collision)
 *     → rule evaluator runs against merged context
 *     → returns matched branch's returnValue or rule.otherwiseValue
 *
 * Demo route: /flag-context-demo
 *   - Upserts the test flag locally on mount (state: 'on-with-rule', rule:
 *     plan == 'enterprise' → true, otherwise false).
 *   - Three buttons call bridge.flag(key, default, { attributes: { plan } })
 *     for plan in {enterprise, pro, free} and render the result.
 *
 * Scope:
 *   This covers the raw `BridgeFlags.flag(key, default, { attributes })`
 *   surface wired into a Svelte app. The Svelte wrappers now forward per-call
 *   attributes too (<FeatureFlag context={{ attributes }}>), and /flag-demo +
 *   feature-flags.spec.ts cover that path — but only as "one of the two
 *   branches rendered", because their flag's rule lives server-side. The
 *   locally-seeded flag here is what makes the per-plan return value, and the
 *   no-leak-between-calls property, actually assertable.
 */

import { expect, test } from '../../fixtures/auth';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Feature flags — dev-supplied per-call attributes (TBP-178)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/flag-context-demo');

    // Wait for the SDK cache to be seeded with the test flag.
    await expect(page.getByTestId('cache-ready')).toHaveText('ready', {
      timeout: MED_TIMEOUT,
    });

    // Surface any seeding error loudly in the report.
    await expect(page.getByTestId('cache-error')).toHaveCount(0);
  });

  test('plan=enterprise → returns true (matches branch)', async ({ page }) => {
    await page.getByTestId('eval-enterprise').click();

    await expect(page.getByTestId('last-plan')).toHaveText('enterprise');
    await expect(page.getByTestId('flag-result')).toHaveText('true');
  });

  test('plan=pro → returns false (falls through to otherwiseValue)', async ({
    page,
  }) => {
    await page.getByTestId('eval-pro').click();

    await expect(page.getByTestId('last-plan')).toHaveText('pro');
    await expect(page.getByTestId('flag-result')).toHaveText('false');
  });

  test('plan=free → returns false (falls through to otherwiseValue)', async ({
    page,
  }) => {
    await page.getByTestId('eval-free').click();

    await expect(page.getByTestId('last-plan')).toHaveText('free');
    await expect(page.getByTestId('flag-result')).toHaveText('false');
  });

  test('switching plan between calls produces independent results', async ({
    page,
  }) => {
    // Same page, no reload — prove per-call attributes don't leak between
    // calls or get cached on the SDK side.
    await page.getByTestId('eval-enterprise').click();
    await expect(page.getByTestId('flag-result')).toHaveText('true');

    await page.getByTestId('eval-free').click();
    await expect(page.getByTestId('flag-result')).toHaveText('false');

    await page.getByTestId('eval-enterprise').click();
    await expect(page.getByTestId('flag-result')).toHaveText('true');
  });
});
