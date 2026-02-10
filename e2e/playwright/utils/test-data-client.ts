/**
 * Client for interacting with the Playwright test data API.
 *
 * This client communicates with the bridge-api test data endpoints
 * to create and manage test accounts for E2E tests.
 *
 * Copied from bridge-api/e2e/playwright/utils/test-data-client.ts
 * See bridge-api docs/tests/PLAYWRIGHT_PATTERNS.md for patterns and guidelines.
 */

import { EnvironmentConfig } from '../config/environments';

/**
 * Playwright test account data returned from the API.
 */
export interface PlaywrightTestAccount {
  email: string;
  password: string;
  userId: string;
  tenantId: string;
  appId: string;
}

/**
 * Options for creating a test account.
 */
export interface CreateTestAccountOptions {
  email?: string;
  password?: string;
  tenantName?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Client for interacting with the Playwright test data API.
 *
 * This client communicates with the bridge-api test data endpoints
 * to create and manage test accounts for E2E tests.
 */
export class TestDataClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly appDomain: string;

  constructor(config: EnvironmentConfig) {
    this.baseUrl = config.testDataApiUrl;
    this.apiKey = config.testDataApiKey;
    this.appDomain = config.appDomain;
  }

  /**
   * Creates a test account for Playwright tests.
   *
   * @param options - Optional account configuration
   * @returns Created account details including credentials
   */
  async createTestAccount(options?: CreateTestAccountOptions): Promise<PlaywrightTestAccount> {
    const response = await fetch(`${this.baseUrl}/account/test/playwright/account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-playwright-api-key': this.apiKey,
      },
      body: JSON.stringify({
        appDomain: this.appDomain,
        ...options,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create test account: ${response.status} ${error}`);
    }

    return response.json();
  }

  /**
   * Removes a test account created by Playwright tests.
   *
   * @param email - Email of the test account to remove
   */
  async removeTestAccount(email: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/account/test/playwright/account`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-playwright-api-key': this.apiKey,
      },
      body: JSON.stringify({
        email,
        appDomain: this.appDomain,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to remove test account: ${response.status} ${error}`);
    }
  }

  /**
   * Health check to verify the test data API is reachable.
   */
  async healthCheck(): Promise<{ success: boolean; diagnostics?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/account/test/playwright/health`, {
        method: 'GET',
        headers: {
          'x-playwright-api-key': this.apiKey,
        },
      });

      const responseText = await response.text();
      let responseBody: any;
      try {
        responseBody = JSON.parse(responseText);
      } catch {
        responseBody = responseText;
      }

      if (!response.ok) {
        const diagnostics = [
          `Health check failed: ${response.status} ${response.statusText}`,
          `API Key: ${this.apiKey ? `SET (${this.apiKey.substring(0, 8)}...)` : 'MISSING'}`,
          `Response: ${JSON.stringify(responseBody)}`,
        ].join(' | ');

        console.error(`[TestDataClient] ${diagnostics}`);
        return { success: false, diagnostics };
      }

      return { success: true };
    } catch (error: any) {
      const diagnostics = [
        `[TestDataClient] Health check error: ${error.message}`,
        `URL: ${this.baseUrl}/account/test/playwright/health`,
        `API Key: ${this.apiKey ? 'SET' : 'MISSING'}`,
      ].join('\n');
      console.error(diagnostics);
      return { success: false, diagnostics };
    }
  }

  /**
   * Sets up a standalone test app with an owner user (idempotent).
   *
   * Creates a NEW app with a custom domain (e.g., BRIDGE_SVELTE_E2E_TEST),
   * completely separate from the Bridge admin app.
   *
   * If the app already exists (by domain), returns the existing one.
   * If it doesn't exist, creates it with the owner user.
   * The app is never deleted — it persists across test runs.
   *
   * @param domain - Unique app domain (e.g., 'BRIDGE_SVELTE_E2E_TEST')
   * @param appName - Display name for the app
   * @param ownerEmail - Email for the owner user
   * @param ownerPassword - Password for the owner user (defaults to 'helloworld')
   * @returns App and user info including appId
   */
  async setupTestApp(
    domain: string,
    appName: string,
    ownerEmail: string,
    ownerPassword?: string,
    appUrl?: string,
  ): Promise<{
    appId: string;
    domain: string;
    tenantId: string;
    userId: string;
    email: string;
    message: string;
  }> {
    const response = await fetch(
      `${this.baseUrl}/account/test/playwright/setup-test-app`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-playwright-api-key': this.apiKey,
        },
        body: JSON.stringify({
          domain,
          appName,
          ownerEmail,
          ownerPassword,
          appUrl,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to setup test app: ${response.status} ${error}`);
    }

    return response.json();
  }

  /**
   * Purges all Playwright test accounts for the app.
   * Removes all accounts matching pattern: playwright-test-*@thebridge.io
   *
   * @returns Number of accounts purged
   */
  async purgeTestAccounts(): Promise<number> {
    const response = await fetch(`${this.baseUrl}/account/test/playwright/purge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-playwright-api-key': this.apiKey,
      },
      body: JSON.stringify({
        appDomain: this.appDomain,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to purge test accounts: ${response.status} ${error}`);
    }

    const result = await response.json();
    return result.purgedCount;
  }
}

/**
 * Create a test data client from environment variables.
 * Useful for global setup/teardown scripts.
 *
 * The test data API URL is resolved per environment:
 * - Local: LOCAL_TEST_DATA_API_URL or http://localhost:3200
 * - Stage: STAGE_TEST_DATA_API_URL
 * - Prod: PROD_TEST_DATA_API_URL
 */
export function createTestDataClientFromEnv(): TestDataClient {
  const projectName = process.env.PLAYWRIGHT_PROJECT_NAME || '';
  let testDataApiUrl: string;

  if (projectName.includes('prod')) {
    testDataApiUrl = process.env.PROD_TEST_DATA_API_URL || '';
  } else if (projectName.includes('stage')) {
    testDataApiUrl = process.env.STAGE_TEST_DATA_API_URL || '';
  } else {
    testDataApiUrl =
      process.env.LOCAL_TEST_DATA_API_URL || 'http://localhost:3200';
  }

  const testDataApiKey = process.env.PLAYWRIGHT_TEST_API_KEY;
  const appDomain = process.env.APP_DOMAIN || 'BRIDGE_SVELTE_TEST_DASHBOARD';

  if (!testDataApiKey) {
    throw new Error('PLAYWRIGHT_TEST_API_KEY environment variable is required');
  }

  return new TestDataClient({
    name: 'local',
    baseUrl: '',
    testDataApiUrl,
    testDataApiKey,
    appId: process.env.BRIDGE_TEST_APP_ID || '',
    appDomain,
    isContainer: false,
  });
}
