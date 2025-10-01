// src/lib/config/bridgeConfig.ts
import { derived, writable } from 'svelte/store';
import { logger } from '../../shared/logger.js';
import type { BridgeConfig } from '../../shared/types/config.js';
import type { RouteGuardConfig } from '../auth/route-guard.js';

interface ConfigStoreState {
  config: BridgeConfig | null;
  routeConfig: RouteGuardConfig | null;
  loaded: boolean;
}

const DEFAULT_CONFIG: Partial<BridgeConfig> = {
  authBaseUrl: 'https://auth.nblocks.cloud',
  backendlessBaseUrl: 'https://backendless.nblocks.cloud',
  teamManagementUrl: 'https://backendless.nblocks.cloud/user-management-portal/users',
  defaultRedirectRoute: '/',
  loginRoute: '/login',
  debug: false
};

const { subscribe, set, update } = writable<ConfigStoreState>({
  config: null,
  routeConfig: null,
  loaded: false
});

export const bridgeConfig = {
  subscribe,
  initConfig: (config: BridgeConfig, routeConfig?: RouteGuardConfig) => {
    if (!config?.appId) {
      throw new Error('Bridge appId is required but was not provided in bridge configuration.');
    }

    const merged = {
      ...DEFAULT_CONFIG,
      ...config
    } as BridgeConfig;

    // Set bridge full config and mark it as loaded
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
export const configReady = derived(bridgeConfig, ($state) => $state.loaded);
export const readonlyConfig = derived(bridgeConfig, ($state) => $state.config);

// Synchronous access to latest config value
let _currentConfig: BridgeConfig | null = null;
let _currentRouteConfig: RouteGuardConfig | null = null;
bridgeConfig.subscribe(($state) => {
  if ($state.loaded) {
    _currentConfig = $state.config;
    _currentRouteConfig = $state.routeConfig;
  }
});

export function getConfig(): BridgeConfig {
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