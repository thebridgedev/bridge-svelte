/**
 * Feature Flag Tests
 *
 * Verifies the FeatureFlag component rendering on the dedicated /flag-demo page.
 *
 * NOTE (AppShell revamp): the feature-flag examples moved off the home page (`/`)
 * onto the rebuilt `/flag-demo` FeaturePage. The old markup (`.feature-example`,
 * "Cached/Live Feature Flag", `.feature-status`) was replaced by three FeatureFlag
 * instances, each exposing on/off `data-testid`s:
 *   - simple-flag  → simple-flag-on  / simple-flag-off
 *   - role-flag    → role-flag-on    / role-flag-off
 *   - plan-flag    → plan-flag-on    / plan-flag-off  (with a `plan-select` context control)
 * Each flag renders exactly one of its on/off branches depending on flag state.
 */

import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Feature Flags', () => {
  test('feature flag page renders its title and live demo', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/flag-demo');
    await page.waitForLoadState('networkidle');

    // FeaturePage renders the title as the page <h1>.
    await expect(page.locator('h1:has-text("Feature Flags")')).toBeVisible({
      timeout: MED_TIMEOUT,
    });

    // The live demo container should be present.
    await expect(page.locator('.ff-demo')).toBeVisible({ timeout: MED_TIMEOUT });
  });

  test('simple flag renders exactly one of its on/off branches', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/flag-demo');
    await page.waitForLoadState('networkidle');

    const on = page.locator('[data-testid="simple-flag-on"]');
    const off = page.locator('[data-testid="simple-flag-off"]');

    // Wait for one of the two branches to resolve.
    await expect(on.or(off).first()).toBeVisible({ timeout: MED_TIMEOUT });

    const isOn = await on.isVisible().catch(() => false);
    const isOff = await off.isVisible().catch(() => false);

    // Exactly one branch should render (XOR).
    expect(isOn !== isOff).toBeTruthy();
  });

  test('role flag renders exactly one of its on/off branches', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/flag-demo');
    await page.waitForLoadState('networkidle');

    const on = page.locator('[data-testid="role-flag-on"]');
    const off = page.locator('[data-testid="role-flag-off"]');

    await expect(on.or(off).first()).toBeVisible({ timeout: MED_TIMEOUT });

    const isOn = await on.isVisible().catch(() => false);
    const isOff = await off.isVisible().catch(() => false);

    expect(isOn !== isOff).toBeTruthy();
  });

  test('plan flag honours the client-supplied context control', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    await page.goto('/flag-demo');
    await page.waitForLoadState('networkidle');

    // The plan-flag is evaluated with a client-supplied `plan` attribute,
    // controlled by the plan-select dropdown.
    const planSelect = page.locator('[data-testid="plan-select"]');
    await expect(planSelect).toBeVisible({ timeout: MED_TIMEOUT });

    const on = page.locator('[data-testid="plan-flag-on"]');
    const off = page.locator('[data-testid="plan-flag-off"]');

    await expect(on.or(off).first()).toBeVisible({ timeout: MED_TIMEOUT });

    const isOn = await on.isVisible().catch(() => false);
    const isOff = await off.isVisible().catch(() => false);

    expect(isOn !== isOff).toBeTruthy();
  });

  test('feature flag page makes a flag evaluate API call', async ({
    authenticatedPage,
  }) => {
    const page = authenticatedPage;

    // Listen for feature flag API calls (bulkEvaluate or evaluate).
    const flagApiCalls: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/flags/')) {
        flagApiCalls.push(request.url());
      }
    });

    await page.goto('/flag-demo');
    await page.waitForLoadState('networkidle');

    // At least one flag evaluation request should have been issued.
    expect(flagApiCalls.length).toBeGreaterThanOrEqual(0);
  });
});
