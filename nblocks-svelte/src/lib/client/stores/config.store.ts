// src/lib/config/nblocksConfig.ts
import { derived, writable } from 'svelte/store';
import { logger } from '../../shared/logger.js';
import type { NblocksConfig } from '../../shared/types/config.js';
import type { RouteGuardConfig } from '../auth/route-guard.js';

interface ConfigStoreState {
  config: NblocksConfig | null;
  routeConfig: RouteGuardConfig | null;
  loaded: boolean;
}

const DEFAULT_CONFIG: Partial<NblocksConfig> = {
  authBaseUrl: 'https://auth.nblocks.cloud',
  backendlessBaseUrl: 'https://backendless.nblocks.cloud',
  teamManagementUrl: 'https://backendless.nblocks.cloud/user-management-portal/users',
  defaultRedirectRoute: '/',
  loginRoute: '/login',
  debug: false,
  callbackUrl: '/auth/oauth-callback',
};

const { subscribe, set, update } = writable<ConfigStoreState>({
  config: null,
  routeConfig: null,
  loaded: false
});

export const nblocksConfig = {
  subscribe,
  initConfig: (config: NblocksConfig, routeConfig?: RouteGuardConfig) => {
    if (!config?.appId) {
      throw new Error('nBlocks appId is required but was not provided in the configuration.');
    }

    const merged = {
      ...DEFAULT_CONFIG,
      ...config
    } as NblocksConfig;

    // Set the full config and mark it as loaded
    set({
      config: merged,
      routeConfig: routeConfig || null,
      loaded: true
    });

    // This will only print when debug is true
    logger.debug('[config] initialized', merged);
  }
};

// Convenience derived stores
export const configReady = derived(nblocksConfig, ($state) => $state.loaded);
export const readonlyConfig = derived(nblocksConfig, ($state) => $state.config);

// Synchronous access to latest config value
let _currentConfig: NblocksConfig | null = null;
let _currentRouteConfig: RouteGuardConfig | null = null;
nblocksConfig.subscribe(($state) => {
  if ($state.loaded) {
    _currentConfig = $state.config;
    _currentRouteConfig = $state.routeConfig;
  }
});

export function getConfig(): NblocksConfig {
  if (!_currentConfig) {
    throw new Error('Config has not been initialized. Call  initConfig(...) early in app startup.');
  }
  return _currentConfig;
}

export function getRouteGuardConfig(): RouteGuardConfig {
  if (!_currentRouteConfig) {
    throw new Error('RouteGuardConfig has not been initialized. Call initConfig(...) early in app startup.');
  }
  return _currentRouteConfig;
}