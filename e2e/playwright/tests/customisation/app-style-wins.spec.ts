/**
 * TBP-814 — Bridge pages follow the app's type, and the app's own CSS wins.
 *
 * The plugin's styles live in `@layer bridge`, so any unlayered app CSS beats
 * them whatever its specificity or load order. Text sizes scale from the app's
 * <body> text size; button weight and shadow are tokens. Asserted on computed
 * styles of the sign-up page's primary button.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

const BUTTON = '[data-bridge-auth-route="signup"] .bridge-btn-primary';

const style = (page: Page, prop: string) =>
  page.locator(BUTTON).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

async function openSignup(page: Page) {
  await page.goto('/auth/signup');
  await expect(page.locator(BUTTON).first()).toBeVisible({ timeout: MED_TIMEOUT });

  // The demo must be serving the TBP-814 stylesheet, or every assertion below is
  // about the old CSS. Fail with that, not with a puzzling computed value.
  const layered = await page.evaluate(() =>
    [...document.styleSheets].some((s) => {
      try {
        return [...s.cssRules].some((r) => r instanceof CSSLayerBlockRule && r.name === 'bridge');
      } catch {
        return false;
      }
    }),
  );
  expect(layered, 'the demo serves no `@layer bridge` styles — its bridge-svelte build is stale').toBe(true);
}

test.describe('TBP-814 — the app’s style wins', () => {
  test('button text scales from the app’s <body> font size', async ({ page }) => {
    await openSignup(page);
    expect(await style(page, 'font-size')).toBe('14px'); // 0.875 × the default 16px

    await page.addStyleTag({ content: 'body { font-size: 20px }' });
    expect(await style(page, 'font-size')).toBe('17.5px'); // 0.875 × 20px
  });

  test('button weight and shadow follow their tokens', async ({ page }) => {
    await openSignup(page);
    expect(await style(page, 'font-weight')).toBe('500');
    expect(await style(page, 'box-shadow')).toBe('none');

    await page.addStyleTag({
      content: ':root { --bridge-font-weight-button: 800; --bridge-button-shadow: 4px 4px 0 rgb(0, 0, 0) }',
    });
    expect(await style(page, 'font-weight')).toBe('800');
    expect(await style(page, 'box-shadow')).toBe('rgb(0, 0, 0) 4px 4px 0px 0px');
  });

  test('an unlayered app rule beats the Bridge button rule', async ({ page }) => {
    await openSignup(page);
    expect(await style(page, 'background-color')).not.toBe('rgb(255, 0, 0)');

    // Same specificity as the plugin's own rule: it wins only because the
    // plugin's rule is layered and this one is not.
    await page.addStyleTag({ content: '.bridge-btn-primary { background-color: rgb(255, 0, 0) }' });
    expect(await style(page, 'background-color')).toBe('rgb(255, 0, 0)');
  });

  test('with no app overrides a Bridge button keeps its filled background', async ({ page }) => {
    await openSignup(page);
    const bg = await style(page, 'background-color');
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
    expect(bg).not.toBe('transparent');
    // The demo's app.css sets --bridge-primary to its teal accent.
    expect(bg).toBe('rgb(15, 118, 110)');
  });
});
