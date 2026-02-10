/**
 * Environment configuration for bridge-svelte Playwright E2E tests.
 *
 * This module provides type-safe access to environment-specific settings.
 * All configuration is loaded from environment variables.
 *
 * Pattern borrowed from bridge-api/e2e/playwright/config/environments.ts
 */

export interface EnvironmentConfig {
  /** Demo app URL (the test target) */
  baseUrl: string;
  /** Auth service URL (only needed for local/stage — prod uses plugin defaults) */
  authBaseUrl?: string;
  /** Cloud Views URL (only needed for local/stage — prod uses plugin defaults) */
  cloudViewsUrl?: string;
  /** API URL for test data operations (bridge-api) */
  testDataApiUrl: string;
  /** API key for test data service authentication */
  testDataApiKey: string;
  /** Bridge App ID used by the demo app */
  appId: string;
  /** App domain for test data operations */
  appDomain: string;
  /** Environment name */
  name: 'local' | 'stage' | 'prod';
  /** Whether running inside Docker container */
  isContainer: boolean;
}

/**
 * Detect if running inside a Docker container.
 */
function isRunningInContainer(): boolean {
  if (process.env.DOCKER === 'true' || process.env.IN_DOCKER === 'true') {
    return true;
  }

  try {
    require('fs').accessSync('/.dockerenv');
    return true;
  } catch {
    // Not in Docker
  }

  try {
    const cgroup = require('fs').readFileSync('/proc/self/cgroup', 'utf8');
    return cgroup.includes('docker') || cgroup.includes('containerd');
  } catch {
    // Not available
  }

  return false;
}

/**
 * Get service URL based on whether running in container or host.
 */
function getServiceUrl(
  serviceName: string,
  containerPort: number,
  hostPort: number,
  isContainer: boolean,
): string {
  if (isContainer) {
    return `http://${serviceName}:${containerPort}`;
  }
  return `http://localhost:${hostPort}`;
}

/**
 * Get the current environment configuration.
 *
 * @param environment - The target environment
 * @returns Environment configuration
 * @throws Error if required environment variables are missing
 */
export function getEnvironmentConfig(environment: 'local' | 'stage' | 'prod'): EnvironmentConfig {
  const testDataApiKey = requireEnv('PLAYWRIGHT_TEST_API_KEY');
  const appDomain = process.env.APP_DOMAIN || 'BRIDGE_SVELTE_TEST_DASHBOARD';
  const isContainer = isRunningInContainer();

  // Demo app URL: when tests run on host, Playwright starts the demo via Vite on port 3001.
  // When running inside a container, use service URL (container 3001 → host 3008).
  const baseUrl = isContainer
    ? getServiceUrl('bridge-svelte', 3001, 3008, isContainer)
    : process.env.LOCAL_BASE_URL || 'http://localhost:3001';

  // App ID is set dynamically by global-setup.ts via setupTestApp()
  const appId = requireEnv('BRIDGE_TEST_APP_ID');

  switch (environment) {
    case 'local': {
      // bridge-api: container port 3000 -> host port 3200
      const authBaseUrl = isContainer
        ? getServiceUrl('bridge-api', 3000, 3200, isContainer) + '/auth'
        : process.env.LOCAL_AUTH_BASE_URL || 'http://localhost:3200/auth';

      const cloudViewsUrl = isContainer
        ? getServiceUrl('bridge-cloud-views', 3000, 3091, isContainer)
        : process.env.LOCAL_CLOUD_VIEWS_URL || 'http://localhost:3200/cloud-views';

      const testDataApiUrl = isContainer
        ? getServiceUrl('bridge-api', 3000, 3200, isContainer)
        : process.env.LOCAL_TEST_DATA_API_URL || 'http://localhost:3200';

      return {
        name: 'local',
        baseUrl,
        authBaseUrl,
        cloudViewsUrl,
        testDataApiUrl,
        testDataApiKey,
        appId,
        appDomain,
        isContainer,
      };
    }

    case 'stage':
      return {
        name: 'stage',
        baseUrl,
        authBaseUrl: requireEnv('STAGE_AUTH_BASE_URL'),
        cloudViewsUrl: requireEnv('STAGE_CLOUD_VIEWS_URL'),
        testDataApiUrl: requireEnv('STAGE_TEST_DATA_API_URL'),
        testDataApiKey,
        appId,
        appDomain,
        isContainer: false,
      };

    case 'prod':
      // Prod does NOT set authBaseUrl or cloudViewsUrl — the plugin resolves
      // default production endpoints automatically. This mirrors the real
      // user experience where only appId is provided.
      return {
        name: 'prod',
        baseUrl,
        testDataApiUrl: requireEnv('PROD_TEST_DATA_API_URL'),
        testDataApiKey,
        appId,
        appDomain,
        isContainer: false,
      };
  }
}

/**
 * Get environment variable or throw if not set.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Required environment variable ${name} is not set. ` +
        `Check your config/.env.test.local file or CI secrets.`,
    );
  }
  return value;
}

/**
 * Get optional environment variable with default value.
 */
export function getEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

/**
 * Check if running in CI environment.
 */
export function isCI(): boolean {
  return !!process.env.CI;
}

/**
 * Determine current environment from Playwright project name.
 * Falls back to 'local' if not determinable.
 */
export function getCurrentEnvironment(): 'local' | 'stage' | 'prod' {
  const projectName = process.env.PLAYWRIGHT_PROJECT_NAME || '';

  if (projectName.includes('prod')) return 'prod';
  if (projectName.includes('stage')) return 'stage';
  return 'local';
}
