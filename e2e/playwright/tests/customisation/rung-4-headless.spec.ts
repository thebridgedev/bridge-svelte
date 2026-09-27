/**
 * Customisation level 4 — headless (TBP-698).
 *
 * The app's own form, no Bridge component, calling `getBridgeAuth()`. The
 * fixture is `demo/src/routes/(test-fixtures)/headless/+page.svelte`. What
 * this proves is that nothing is lost by owning the UI: tokens, route guards,
 * the return-to deep link and the signed-in shell all live in bridgeBootstrap
 * and <BridgeBootstrap>, not in Bridge's pages.
 */

import { test, expect, readBridgeTokens } from '../../fixtures/auth';
import { LONG_TIMEOUT, MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Level 4 — headless sign-in with getBridgeAuth()', () => {
  test('the app’s own form signs in, and guards and the shell follow', async ({ page, testUser }) => {
    await page.goto('/headless');
    const form = page.getByTestId('headless-form');
    await expect(form).toBeVisible({ timeout: MED_TIMEOUT });
    // No Bridge form anywhere on the page: this is all the app's markup.
    await expect(page.locator('[data-bridge-auth-form], [data-bridge-auth-route]')).toHaveCount(0);

    await form.locator('input[name="email"]').fill(testUser.email);
    await form.locator('input[name="password"]').fill(testUser.password);
    await form.getByRole('button', { name: 'Continue' }).click();

    // Landed on a protected page, which the route guard let through.
    await page.waitForURL((url) => url.pathname === '/tickets', { timeout: LONG_TIMEOUT });
    await expect(page.getByRole('heading', { name: 'Tickets' })).toBeVisible({ timeout: MED_TIMEOUT });
    expect((await readBridgeTokens(page))?.accessToken).toBeTruthy();

    // The app shell sees the session too.
    await expect(page.locator('nav button:has-text("Logout")')).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('a deep link survives a headless sign-in', async ({ page, testUser }) => {
    // Signed out, the guard parks the attempted page on the login route…
    await page.goto('/settings/team');
    await page.waitForURL((url) => url.pathname === '/auth/login', { timeout: LONG_TIMEOUT });
    const returnTo = new URL(page.url()).searchParams.get('redirectUri');
    expect(returnTo).toBe('/settings/team');

    // …and the app's own form hands it to readReturnTo, validated.
    await page.goto(`/headless?redirectUri=${encodeURIComponent(returnTo!)}`);
    const form = page.getByTestId('headless-form');
    await form.locator('input[name="email"]').fill(testUser.email);
    await form.locator('input[name="password"]').fill(testUser.password);
    await form.getByRole('button', { name: 'Continue' }).click();

    await page.waitForURL((url) => url.pathname === '/settings/team', { timeout: LONG_TIMEOUT });
    await expect(page.locator('[data-bridge-team-panel]')).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('a wrong password is the app’s to show', async ({ page, testUser }) => {
    await page.goto('/headless');
    const form = page.getByTestId('headless-form');
    await form.locator('input[name="email"]').fill(testUser.email);
    await form.locator('input[name="password"]').fill(`${testUser.password}-wrong`);
    await form.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByTestId('headless-error')).toBeVisible({ timeout: LONG_TIMEOUT });
    await expect(page.getByTestId('headless-state')).toHaveText('signed-out');
    expect(page.url()).toContain('/headless');
  });
});
