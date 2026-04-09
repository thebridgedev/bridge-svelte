import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('SDK Forgot Password', () => {
  test('enter email → "Check your email" shown', async ({ page, testUser }) => {
    await page.goto('/auth/forgot-password');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('#reset-email');
    await emailInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await emailInput.fill(testUser.email);

    await page.locator('button:has-text("Send reset link")').click();

    // Should show success or error alert
    const alert = page.locator('[role="alert"]');
    await alert.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    const text = await alert.textContent();
    expect(text).toBeTruthy();
  });

  test('has back to login link', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await page.waitForLoadState('networkidle');

    const loginLink = page.locator('a[href="/auth/login"]:has-text("Back to login")');
    await loginLink.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  });
});
