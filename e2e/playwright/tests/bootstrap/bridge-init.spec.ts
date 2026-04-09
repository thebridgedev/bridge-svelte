/**
 * Bootstrap / Bridge Initialization Tests
 *
 * Verifies that the BridgeBootstrap component initializes correctly
 * and the demo app loads without errors.
 */

import { test, expect } from '@playwright/test';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Bridge Initialization', () => {
  test('demo app loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];

    // Collect console errors during page load
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Filter out known non-critical errors (e.g., favicon 404)
    const criticalErrors = consoleErrors.filter(
      (err) =>
        !err.includes('favicon') &&
        !err.includes('404') &&
        !err.includes('Failed to load resource'),
    );

    expect(criticalErrors).toEqual([]);
  });

  test('BridgeBootstrap component renders without errors', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // The page should have the main content rendered (not a blank page)
    const heading = page.locator('h1');
    await expect(heading).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('ConfigStatus component displays configuration state', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // The ConfigStatus component should be visible on the home page
    // It displays bridge config status information
    const configStatus = page.locator('text=Bridge');
    await expect(configStatus.first()).toBeVisible({ timeout: MED_TIMEOUT });
  });
});
