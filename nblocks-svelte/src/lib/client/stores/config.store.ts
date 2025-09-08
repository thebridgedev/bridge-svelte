// src/lib/config/nblocksConfig.ts
import { derived, writable } from 'svelte/store';
import { logger } from '../../shared/logger.js';
import type { NblocksConfig } from '../../shared/types/config.js';

const DEFAULT_CONFIG: Partial<NblocksConfig> = {
  authBaseUrl: 'https://auth.nblocks.cloud',
  backendlessBaseUrl: 'https://backendless.nblocks.cloud',
  teamManagementUrl: 'https://backendless.nblocks.cloud/user-management-portal/users',
  defaultRedirectRoute: '/',
  loginRoute: '/login',
  debug: false
};

// Function to get environment variables
export function getConfigFromEnv(): NblocksConfig {
  const appId = import.meta.env.VITE_NBLOCKS_APP_ID || '';
  const authBaseUrl = import.meta.env.VITE_NBLOCKS_AUTH_BASE_URL || DEFAULT_CONFIG.authBaseUrl;
  const backendlessBaseUrl = import.meta.env.VITE_NBLOCKS_BACKENDLESS_BASE_URL || DEFAULT_CONFIG.backendlessBaseUrl;
  const callbackUrl = import.meta.env.VITE_NBLOCKS_CALLBACK_URL || '';
  const teamManagementUrl = import.meta.env.VITE_NBLOCKS_TEAM_MANAGEMENT_URL || DEFAULT_CONFIG.teamManagementUrl;
  const defaultRedirectRoute = import.meta.env.VITE_NBLOCKS_DEFAULT_REDIRECT_ROUTE || DEFAULT_CONFIG.defaultRedirectRoute;
  const loginRoute = import.meta.env.VITE_NBLOCKS_LOGIN_ROUTE || DEFAULT_CONFIG.loginRoute;
  const debug = import.meta.env.VITE_NBLOCKS_DEBUG === 'true' || DEFAULT_CONFIG.debug;  
  return {
    appId,
    authBaseUrl,
    backendlessBaseUrl,
    callbackUrl,
    teamManagementUrl,
    defaultRedirectRoute,
    loginRoute,
    debug
  };
}

// Create a writable store and initialize it immediately
const initialConfig = getConfigFromEnv();
logger.debug('[config] initialConfig', initialConfig);
if (!initialConfig.appId) {
  throw new Error('nBlocks appId is required but was not provided in the environment configuration.');
}

export const nblocksConfig = writable<NblocksConfig>(initialConfig);

// Provide a derived read-only store
export const readonlyConfig = derived(nblocksConfig, ($config) => $config);

// Allow runtime initialization with external config
export function initConfig(config: NblocksConfig) {
  if (!config.appId) {
    throw new Error('nBlocks appId is required but was not provided in the configuration.');
  }
  nblocksConfig.set({
    ...DEFAULT_CONFIG,
    ...config
  });
}

// Allow synchronous access to the latest config value
let _currentConfig: NblocksConfig = initialConfig;
nblocksConfig.subscribe((cfg) => {
  if (cfg) _currentConfig = cfg;
});

export function getConfig(): NblocksConfig {
  if (!_currentConfig) {
    throw new Error('Config has not been initialized.');
  }
  return _currentConfig;
}
