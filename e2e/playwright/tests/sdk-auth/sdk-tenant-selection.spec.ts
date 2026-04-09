import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

/**
 * Tenant selection E2E tests require a multi-tenant test user.
 * These tests verify the SDK auth login page renders correctly.
 */
test.describe('SDK Tenant Selection', () => {
  test('SDK auth login page renders', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    // Verify login form renders
    const emailInput = page.locator('#login-email');
    await emailInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    expect(await emailInput.isVisible()).toBe(true);
  });
});
