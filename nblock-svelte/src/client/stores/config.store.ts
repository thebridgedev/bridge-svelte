import { writable } from 'svelte/store';
import type { NblocksConfig } from '../../shared/types/config.js';

const DEFAULT_CONFIG: Partial<NblocksConfig> = {
  authBaseUrl: 'https://auth.nblocks.cloud',
  teamManagementUrl: 'https://backendless.nblocks.cloud/user-management-portal/users',
  defaultRedirectRoute: '/',
  loginRoute: '/login',
  debug: false
};

// Create a writable store for the config
export const nblocksConfig = writable<NblocksConfig | null>(null);

// Function to initialize the config
export function initConfig(config: NblocksConfig) {
  if (!config.appId) {
    throw new Error('nBlocks appId is required but was not provided in the configuration.');
  }
  nblocksConfig.set({
    ...DEFAULT_CONFIG,
    ...config
  });
}

// Function to get environment variables
export function getConfigFromEnv(): NblocksConfig {
  const appId = import.meta.env.VITE_NBLOCKS_APP_ID || '';
  const authBaseUrl = import.meta.env.VITE_NBLOCKS_AUTH_BASE_URL || DEFAULT_CONFIG.authBaseUrl;
  const callbackUrl = import.meta.env.VITE_NBLOCKS_CALLBACK_URL || '';
  const teamManagementUrl = import.meta.env.VITE_NBLOCKS_TEAM_MANAGEMENT_URL || DEFAULT_CONFIG.teamManagementUrl;
  const defaultRedirectRoute = import.meta.env.VITE_NBLOCKS_DEFAULT_REDIRECT_ROUTE || DEFAULT_CONFIG.defaultRedirectRoute;
  const loginRoute = import.meta.env.VITE_NBLOCKS_LOGIN_ROUTE || DEFAULT_CONFIG.loginRoute;
  const debug = import.meta.env.VITE_NBLOCKS_DEBUG === 'true' || DEFAULT_CONFIG.debug;

  return {
    appId,
    authBaseUrl,
    callbackUrl,
    teamManagementUrl,
    defaultRedirectRoute,
    loginRoute,
    debug
  };
} 