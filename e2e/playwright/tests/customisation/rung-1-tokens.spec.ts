/**
 * Customisation level 1 — the `--bridge-*` tokens are the theming contract (TBP-698).
 *
 * The demo's app.css sets a few tokens on :root (a teal primary, 10px corners)
 * the way an app would. These tests prove:
 *   - the app's tokens win whatever order the stylesheets load in — the plugin
 *     declares its defaults on `:where(:root)`, zero specificity;
 *   - setting the tokens restyles every Bridge page and component, asserted on
 *     computed styles before and after;
 *   - the deprecated names still work for an app that set them.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';

/** The demo's app.css: `--bridge-primary: #0f766e`, `--bridge-border-radius: 10px`. */
const DEMO_PRIMARY = 'rgb(15, 118, 110)';
const DEMO_RADIUS = '10px';

/** A theme nothing else uses, so a match can only come from these tokens. */
const THEME = {
  '--bridge-primary': 'rgb(190, 24, 93)',
  '--bridge-primary-fg': 'rgb(255, 250, 240)',
  '--bridge-border': 'rgb(2, 132, 199)',
  '--bridge-border-radius': '3px',
  '--bridge-bg': 'rgb(254, 252, 232)',
  '--bridge-foreground': 'rgb(20, 83, 45)',
  '--bridge-muted': 'rgb(120, 53, 15)',
} as const;

async function applyTheme(page: Page, vars: Record<string, string> = THEME) {
  const body = Object.entries(vars)
    .map(([k, v]) => `${k}: ${v};`)
    .join(' ');
  // `:root:root` outranks the demo's own `:root` whatever order Vite injects
  // the page's stylesheets in: this stands in for the app changing its tokens.
  await page.addStyleTag({ content: `:root:root { ${body} }` });
}

const style = (page: Page, selector: string, prop: string) =>
  page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test.describe('Level 1 — theme tokens', () => {
  test('the app’s :root tokens win even when the plugin stylesheet loads last', async ({ page }) => {
    await page.goto('/auth/signup');
    const button = '[data-bridge-auth-route="signup"] .bridge-btn-primary';
    await expect(page.locator(button)).toBeVisible({ timeout: MED_TIMEOUT });
    expect(await style(page, button, 'background-color')).toBe(DEMO_PRIMARY);

    // Move the plugin's stylesheet after the app's. With its defaults on a
    // plain `:root` it would now win; on `:where(:root)` it cannot.
    const moved = await page.evaluate(() => {
      const sheet = [...document.querySelectorAll('style, link[rel="stylesheet"]')].find((el) =>
        (el.textContent ?? '').includes('--bridge-alert-error-bg: #fef2f2'),
      );
      if (!sheet) return false;
      document.head.appendChild(sheet);
      return true;
    });
    expect(moved, 'plugin stylesheet not found on the page').toBe(true);

    expect(await style(page, button, 'background-color')).toBe(DEMO_PRIMARY);
    expect(await style(page, '#signup-email', 'border-top-left-radius')).toBe(DEMO_RADIUS);
  });

  test('tokens restyle every sign-in page', async ({ page }) => {
    for (const [path, route, input] of [
      ['/auth/signup', 'signup', '#signup-email'],
      ['/auth/forgot-password', 'forgot-password', '#reset-email'],
      ['/auth/magic-link', 'magic-link', '#magic-email'],
      ['/auth/set-password/x', 'set-password', '#newPassword'],
    ] as const) {
      await page.goto(path);
      const scope = `[data-bridge-auth-route="${route}"]`;
      await expect(page.locator(`${scope} ${input}`), path).toBeVisible({ timeout: MED_TIMEOUT });

      expect(await style(page, `${scope} ${input}`, 'border-top-left-radius'), path).toBe(DEMO_RADIUS);
      await applyTheme(page);
      expect(await style(page, `${scope} ${input}`, 'border-top-color'), path).toBe(THEME['--bridge-border']);
      expect(await style(page, `${scope} ${input}`, 'border-top-left-radius'), path).toBe('3px');

      const button = `${scope} .bridge-btn-primary`;
      if ((await page.locator(button).count()) > 0) {
        expect(await style(page, button, 'background-color'), path).toBe(THEME['--bridge-primary']);
        expect(await style(page, button, 'color'), path).toBe(THEME['--bridge-primary-fg']);
      }
    }
  });

  test('tokens restyle the team panel and its dialogs', async ({ authenticatedPage: page }) => {
    await page.goto('/settings/team');
    const activeTab = '.bridge-team-tab[data-active="true"]';
    await expect(page.locator(activeTab)).toBeVisible({ timeout: MED_TIMEOUT });
    await expect(page.locator('.bridge-team-table')).toBeVisible({ timeout: LONG_TIMEOUT });
    expect(await style(page, activeTab, 'color')).toBe(DEMO_PRIMARY);

    await applyTheme(page);
    expect(await style(page, activeTab, 'color')).toBe(THEME['--bridge-primary']);
    expect(await style(page, '.bridge-team-table th', 'color')).toBe(THEME['--bridge-muted']);
    expect(await style(page, '.bridge-team-table th', 'border-bottom-color')).toBe(THEME['--bridge-border']);

    await page.getByRole('button', { name: 'Add Member', exact: true }).click();
    const dialog = 'dialog[data-bridge-team-dialog][open]';
    await expect(page.locator(dialog)).toBeVisible({ timeout: MED_TIMEOUT });
    expect(await style(page, dialog, 'background-color')).toBe(THEME['--bridge-bg']);
    expect(await style(page, dialog, 'color')).toBe(THEME['--bridge-foreground']);
    expect(await style(page, dialog, 'border-top-left-radius')).toBe('3px');
    expect(await style(page, `${dialog} .bridge-btn-primary`, 'background-color')).toBe(THEME['--bridge-primary']);
  });

  test('tokens restyle the upgrade dialog a plan limit opens', async ({ authenticatedPage: page }) => {
    await page.goto('/tickets');
    await applyTheme(page);
    await page.getByRole('button', { name: 'New ticket' }).click();

    const dialog = 'dialog.bridge-upgrade-dialog[open]';
    await expect(page.locator(dialog)).toBeVisible({ timeout: MED_TIMEOUT });
    expect(await style(page, dialog, 'background-color')).toBe(THEME['--bridge-bg']);
    expect(await style(page, '[data-bridge-upgrade-dialog-cta]', 'background-color')).toBe(THEME['--bridge-primary']);
    expect(await style(page, '[data-bridge-upgrade-dialog-cta]', 'color')).toBe(THEME['--bridge-primary-fg']);
  });

  test('tokens restyle the workspace list, derived tokens included', async ({ authenticatedPage: page }) => {
    await page.goto('/auth/workspaces');
    const avatar = '[data-bridge-workspace-item][data-active="true"] [data-bridge-workspace-avatar]';
    await expect(page.locator(avatar)).toBeVisible({ timeout: LONG_TIMEOUT });
    const tintBefore = await style(page, '[data-bridge-workspace-item][data-active="true"]', 'background-color');

    await applyTheme(page);
    expect(await style(page, avatar, 'background-color')).toBe(THEME['--bridge-primary']);
    expect(await style(page, avatar, 'color')).toBe(THEME['--bridge-primary-fg']);
    // --bridge-primary-light is derived from --bridge-primary where it is used,
    // so the active row's tint follows the new primary without being set.
    const tintAfter = await style(page, '[data-bridge-workspace-item][data-active="true"]', 'background-color');
    expect(tintAfter).not.toBe(tintBefore);
  });

  test('the deprecated names still apply when the new ones are unset', async ({ page }) => {
    await page.goto('/auth/signup');
    const button = '[data-bridge-auth-route="signup"] .bridge-btn-primary';
    await expect(page.locator(button)).toBeVisible({ timeout: MED_TIMEOUT });

    // `initial` makes the new name unset, as in an app that never heard of it.
    await applyTheme(page, {
      '--bridge-primary-fg': 'initial',
      '--bridge-primary-foreground': 'rgb(9, 9, 9)',
    });
    expect(await style(page, button, 'color')).toBe('rgb(9, 9, 9)');
  });
});
