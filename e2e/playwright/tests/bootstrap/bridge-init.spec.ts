/**
 * Bootstrap / Bridge Initialization Tests
 *
 * Verifies that the BridgeBootstrap component initializes correctly
 * and the demo app loads without errors.
 */

import { test, expect } from '../../fixtures/auth';
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

    // What this test waits for is "the app finished booting", which the rendered
    // heading states. It cannot wait for the network to go idle: the demo holds a
    // persistent Centrifugo WebSocket, so idle never arrives (TBP-605).
    await expect(page.locator('h1')).toBeVisible({ timeout: MED_TIMEOUT });

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

    // The page should have the main content rendered (not a blank page)
    const heading = page.locator('h1');
    await expect(heading).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('ConfigStatus component displays configuration state', async ({ page }) => {
    await page.goto('/');

    // The ConfigStatus component should be visible on the home page
    // It displays bridge config status information
    const configStatus = page.locator('text=Bridge');
    await expect(configStatus.first()).toBeVisible({ timeout: MED_TIMEOUT });
  });

  // TBP-695 — <BridgeBootstrap> owns readiness: the app inside it renders only
  // once Bridge is ready, with no ready flag in the app. The demo's DEBUG
  // `onBootstrapComplete` stamps when Bridge reported ready; a MutationObserver
  // stamps when page content first entered the DOM. Content first → the gate
  // is gone and the app renders before Bridge is ready.
  test('the app renders only once Bridge is ready (TBP-695)', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __firstContentAt?: number };
      new MutationObserver(() => {
        if (w.__firstContentAt === undefined && document.querySelector('h1')) {
          w.__firstContentAt = performance.now();
        }
      }).observe(document, { childList: true, subtree: true });
    });

    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible({ timeout: MED_TIMEOUT });

    const stamps = await page.evaluate(() => {
      const w = window as unknown as { __firstContentAt?: number; __bridgeBootstrapCompleteAt?: number };
      return { content: w.__firstContentAt, ready: w.__bridgeBootstrapCompleteAt };
    });
    expect(stamps.ready, 'onBootstrapComplete never fired').toEqual(expect.any(Number));
    expect(stamps.content, 'content never observed').toEqual(expect.any(Number));
    expect(stamps.content!).toBeGreaterThanOrEqual(stamps.ready!);
  });
});
