/**
 * Public Routes Tests
 *
 * Verifies that public routes are accessible without authentication.
 * The demo app configures '/' as a public route in its route guard config.
 */

import { test, expect } from '@playwright/test';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Public Routes', () => {
  test('home page is accessible without authentication', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Should show the welcome heading
    const heading = page.locator('h1:has-text("Welcome to Bridge Svelte Demo")');
    await expect(heading).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('home page displays feature overview sections', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify feature overview sections are rendered
    await expect(page.locator('text=Feature Flags').first()).toBeVisible();
    await expect(page.locator('text=Team Management').first()).toBeVisible();
    await expect(page.locator('text=authentication').first()).toBeVisible();
  });

  test('home page shows Login button when not authenticated', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // The navbar shows a Login link when not authenticated
    const loginLink = page.locator('a.nav-link--login');
    await expect(loginLink).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('navbar displays "Bridge Demo" brand link', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const brandLink = page.locator('a.nav-brand:has-text("Bridge Demo")');
    await expect(brandLink).toBeVisible();
    await expect(brandLink).toHaveAttribute('href', '/');
  });
});
