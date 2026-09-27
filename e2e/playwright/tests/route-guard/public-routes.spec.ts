/**
 * Public Routes Tests
 *
 * Verifies that public routes are accessible without authentication.
 * The demo app configures '/' as a public route in its route guard config.
 */

import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Public Routes', () => {
  test('home page is accessible without authentication', async ({ page }) => {
    await page.goto('/');

    // Should show the welcome heading
    const heading = page.locator('h1:has-text("Welcome to Bridge Svelte Demo")');
    await expect(heading).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('home page renders the app’s own nav without signing in', async ({ page }) => {
    await page.goto('/');

    for (const label of ['Home', 'Tickets', 'Team', 'Subscription']) {
      await expect(page.locator(`a.nav-link:has-text("${label}")`).first(), label).toBeVisible({
        timeout: MED_TIMEOUT,
      });
    }
  });

  test('home page shows Login button when not authenticated', async ({ page }) => {
    await page.goto('/');

    // The navbar shows a Login link when not authenticated
    const loginLink = page.locator('a.nav-link--login');
    await expect(loginLink).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('navbar displays "Bridge Demo" brand link', async ({ page }) => {
    await page.goto('/');

    const brandLink = page.locator('a.nav-brand:has-text("Bridge Demo")');
    await expect(brandLink).toBeVisible();
    await expect(brandLink).toHaveAttribute('href', '/');
  });
});
