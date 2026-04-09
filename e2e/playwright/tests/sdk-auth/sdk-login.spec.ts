import { test, expect, loginViaSdkAuth } from '../../fixtures/auth';
import { MED_TIMEOUT, LONG_TIMEOUT } from '../../fixtures/timeouts';

test.describe('SDK Login', () => {
  test('email step → password step → login → tokens in localStorage', async ({
    page,
    testUser,
    envConfig,
  }) => {
    await loginViaSdkAuth(page, testUser.email, testUser.password);

    // Verify tokens exist
    const hasTokens = await page.evaluate(() => {
      const raw = localStorage.getItem('bridge_tokens');
      if (!raw) return false;
      const tokens = JSON.parse(raw);
      return !!tokens?.accessToken && !!tokens?.refreshToken && !!tokens?.idToken;
    });
    expect(hasTokens).toBe(true);
  });

  test('shows error on wrong credentials', async ({ page, testUser }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    // Fill email and password on the single-step form
    const emailInput = page.locator('#login-email');
    await emailInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    await emailInput.fill(testUser.email);

    const passwordInput = page.locator('#login-password');
    await passwordInput.fill('wrong-password-123');
    await page.locator('button[type="submit"]:has-text("Sign in")').click();

    // Should show error alert
    const alert = page.locator('[role="alert"]');
    await alert.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    expect(await alert.textContent()).toBeTruthy();
  });

  test('forgot password link shows reset step then back returns to login', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    // Credentials step should be visible
    await page.locator('#login-email').waitFor({ state: 'visible', timeout: MED_TIMEOUT });

    // Click "Forgot password?" to open the inline reset step
    await page.locator('button:has-text("Forgot password?")').click();

    // Reset step should now be showing (no email/password inputs)
    await expect(page.locator('#login-email')).not.toBeVisible();
    await expect(page.locator('#login-password')).not.toBeVisible();

    // Click "Back to login" to return to credentials step
    await page.locator('button:has-text("Back to login")').click();

    // Credentials step should be visible again
    await page.locator('#login-email').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
  });
});
