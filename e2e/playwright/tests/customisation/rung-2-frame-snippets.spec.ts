/**
 * Customisation level 2 — own the frame, not the routes (TBP-698).
 *
 * `<BridgeAuthRoutes>` and `<BridgeBillingRoutes>` take a `frame(page,
 * children)` snippet for everything around each page and a `heading(page)`
 * snippet for its title. The plugin keeps serving every route. The fixtures
 * are `(test-fixtures)/auth/framed/[...bridge]` and
 * `(test-fixtures)/billing-framed/[...bridge]`.
 */

import { test, expect } from '../../fixtures/auth';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';

/** The catch-all's wrapper for a page — present only when BridgeAuthRoutes rendered it. */
const served = (page: string) => `[data-bridge-auth-route="${page}"]`;

test.describe('Level 2 — frame and heading snippets on the sign-in pages (TBP-696, TBP-537)', () => {
  test('frame wraps every page and heading replaces each main-step heading', async ({ page }) => {
    for (const [route, control] of [
      ['login', '#login-email'],
      ['signup', '#signup-email'],
      ['set-password/x', '#newPassword'],
      ['forgot-password', '#reset-email'],
      ['magic-link', '#magic-email'],
    ] as const) {
      const name = route.split('/')[0];
      await page.goto(`/auth/framed/${route}`);
      const frame = page.locator(`[data-demo-frame="${name}"]`);
      await expect(frame.locator(control), route).toBeVisible({ timeout: MED_TIMEOUT });
      await expect(frame.locator(`[data-demo-heading="${name}"]`), route).toBeVisible();
      // The snippet REPLACES the built-in heading rather than adding a second one.
      await expect(frame.locator('h1, h2'), route).toHaveCount(1);
      // `frame` replaces the default container entirely.
      await expect(page.locator('.bridge-auth-page'), route).toHaveCount(0);
    }
  });

  test('on a login sub-step the frame stays and the heading does not stack (TBP-537)', async ({ page }) => {
    await page.goto('/auth/framed/login');
    const frame = page.locator('[data-demo-frame="login"]');
    await expect(frame.locator('[data-demo-heading="login"]')).toBeVisible({ timeout: MED_TIMEOUT });

    await frame.getByRole('button', { name: 'Forgot password?' }).click();

    await expect(frame.locator('#forgot-email')).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(frame.locator('[data-demo-heading]')).toHaveCount(0);
    await expect(frame.locator('h1, h2')).toHaveCount(1);
    await expect(frame.locator('h2')).toHaveText('Reset your password');

    // And back: the page heading returns with the credentials step.
    await frame.getByRole('button', { name: 'Back to login' }).click();
    await expect(frame.locator('[data-demo-heading="login"]')).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(frame.locator('h1, h2')).toHaveCount(1);
  });

  test('without snippets the default frame is used', async ({ page }) => {
    await page.goto('/auth/signup');
    await expect(page.locator(`${served('signup')} .bridge-auth-page #signup-email`)).toBeVisible({
      timeout: MED_TIMEOUT,
    });
  });
});

test.describe('Level 2 — frame and heading snippets on the subscription pages (TBP-702)', () => {
  test('frame and heading snippets restyle it, and links follow where it lives', async ({ authenticatedPage: page }) => {
    await page.goto('/billing-framed/plan');
    const frame = page.getByTestId('billing-frame');
    await expect(frame).toHaveAttribute('data-page', 'plan', { timeout: MED_TIMEOUT });
    await expect(frame.getByTestId('billing-heading')).toHaveText('Billing · plan');
    await expect(frame.locator('.bridge-billing-heading')).toHaveCount(0);
    await expect(frame.locator('[data-bridge-plan-selector]')).toBeVisible({ timeout: LONG_TIMEOUT });

    await page.goto('/billing-framed/error');
    await expect(page.getByTestId('billing-frame').getByRole('link', { name: 'Back to subscription' })).toHaveAttribute(
      'href',
      '/billing-framed',
    );
  });
});
