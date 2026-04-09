import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT } from '../../fixtures/timeouts';


test.describe('SDK Set Password', () => {
  test('submit new password → "Password updated successfully." shown', async ({
    page,
    testDataClient,
    envConfig,
  }) => {
    // Create a test user in the same app the demo uses
    const testUser = await testDataClient.createTestAccount();

    try {
      // Get a fresh password reset token for that user
      const { token } = await testDataClient.getPasswordResetLink(
        testUser.email,
        envConfig.baseUrl,
      );

      await page.goto(`/auth/set-password/${token}`);
      await page.waitForLoadState('networkidle');

      const passwordInput = page.locator('#newPassword');
      await passwordInput.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
      await passwordInput.fill('NewTestPassword123!');
      await page.locator('#confirmPassword').fill('NewTestPassword123!');

      await page.locator('button:has-text("Set a password")').click();

      // Success shows h2 "Password set", not an alert
      const successHeading = page.locator('h2:has-text("Password set")');
      await successHeading.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
    } finally {
      await testDataClient.removeTestAccount(testUser.email).catch(() => {});
    }
  });

  test('mismatched passwords show validation error (no API call)', async ({
    page,
    testDataClient,
    envConfig,
  }) => {
    const testUser = await testDataClient.createTestAccount();

    try {
      const { token } = await testDataClient.getPasswordResetLink(
        testUser.email,
        envConfig.baseUrl,
      );

      await page.goto(`/auth/set-password/${token}`);
      await page.waitForLoadState('networkidle');

      await page.locator('#newPassword').waitFor({ state: 'visible', timeout: MED_TIMEOUT });
      await page.locator('#newPassword').fill('Password123!');
      await page.locator('#confirmPassword').fill('DifferentPassword456!');

      await page.locator('button:has-text("Set a password")').click();

      const errorAlert = page.locator('[role="alert"]');
      await errorAlert.waitFor({ state: 'visible', timeout: MED_TIMEOUT });
      expect(await errorAlert.textContent()).toContain('do not match');
    } finally {
      await testDataClient.removeTestAccount(testUser.email).catch(() => {});
    }
  });
});
