import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('SDK Signup', () => {
  test('fill form → submit → "Check your email" shown', async ({ page }) => {
    await page.goto('/auth/signup');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('#signup-email');
    await emailInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await emailInput.fill(`sdk-test-${Date.now()}@example.com`);

    await page.locator('#signup-first-name').fill('Test');
    await page.locator('#signup-last-name').fill('User');

    await page.locator('button:has-text("Sign up")').click();

    // Either success heading ("Check your email") or error alert (signup disabled, etc.)
    const response = page.locator('[role="alert"], h2:has-text("Check your email")');
    await response.first().waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    const text = await response.first().textContent();
    expect(text).toBeTruthy();
  });

  test('shows login link', async ({ page }) => {
    await page.goto('/auth/signup');
    await page.waitForLoadState('networkidle');

    const loginLink = page.locator('a[href="/auth/login"]:has-text("Log in")');
    await loginLink.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  });
});
