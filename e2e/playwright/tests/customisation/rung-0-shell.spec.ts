/**
 * Customisation level 0 — Bridge pages render inside the app's shell (TBP-698).
 *
 * Nothing to write: `auth/[...bridge]` and `subscription/[...bridge]` are
 * ordinary SvelteKit pages, so they render inside the app's +layout.svelte.
 * The app's nav, and its fonts and colours, apply to them from the start.
 * The demo's layout is the reference: <Nav />, then <main>, around every page.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

/** The Bridge element sits in the app's <main>, below the app's own nav, and inherits its font. */
async function expectInsideShell(page: Page, bridgeSelector: string, label: string) {
  const bridgeEl = page.locator(`main ${bridgeSelector}`).first();
  await expect(bridgeEl, label).toBeVisible({ timeout: MED_TIMEOUT });
  await expect(page.locator('nav a.nav-brand'), label).toHaveText('Bridge Demo');

  const fonts = await bridgeEl.evaluate((el) => ({
    bridge: getComputedStyle(el).fontFamily,
    body: getComputedStyle(document.body).fontFamily,
  }));
  // The demo's app.css sets the body font; the plugin sets none of its own.
  expect(fonts.body, label).toContain('system-ui');
  expect(fonts.bridge, label).toBe(fonts.body);
}

test.describe('Level 0 — Bridge pages are already in your shell', () => {
  test('every sign-in page renders inside the app layout', async ({ page }) => {
    for (const path of ['/auth/signup', '/auth/forgot-password', '/auth/set-password/x', '/auth/magic-link']) {
      await page.goto(path);
      await expectInsideShell(page, '[data-bridge-auth-form]', path);
    }
  });

  test('the subscription page and the team panel render inside the app layout', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/subscription');
    await expectInsideShell(page, '[data-bridge-billing-route="manage"]', '/subscription');

    await page.goto('/settings/team');
    await expectInsideShell(page, '[data-bridge-team-panel]', '/settings/team');
  });
});
