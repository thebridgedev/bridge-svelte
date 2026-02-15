// src/lib/config/bridgeConfig.ts
import { derived, writable } from 'svelte/store';
import type { RouteGuardConfig } from '../../auth/route-guard.js';
import { logger } from '../../shared/logger.js';
import type { BridgeConfig } from '../../shared/types/config.js';

interface ConfigStoreState {
  config: BridgeConfig | null;
  routeConfig: RouteGuardConfig | null;
  loaded: boolean;
}

const DEFAULT_CONFIG: Partial<BridgeConfig> = {
  authBaseUrl: 'https://api.thebridge.dev/auth',
  teamManagementUrl: 'https://api.thebridge.dev/cloud-views/user-management-portal/users',
  cloudViewsUrl: 'https://api.thebridge.dev/cloud-views',
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

    // Default to /auth/oauth-callback if not provided
    const DEFAULT_CALLBACK_PATH = '/auth/oauth-callback';
    const defaultCallback = typeof window !== 'undefined' 
        ? `${window.location.origin}${DEFAULT_CALLBACK_PATH}`
        : undefined;

    const merged = {
      ...DEFAULT_CONFIG,
      callbackUrl: defaultCallback,
      ...config
    } as BridgeConfig;

    // Use user provided callbackUrl if present, otherwise use default
    if (config.callbackUrl) {
        merged.callbackUrl = config.callbackUrl;
    } else if (!merged.callbackUrl && defaultCallback) {
        merged.callbackUrl = defaultCallback;
    }

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