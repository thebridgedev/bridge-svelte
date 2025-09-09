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

// Writable config store, starts uninitialized until consumer calls initConfig
export const nblocksConfig = writable<NblocksConfig | null>(null);

// Read-only convenience
export const readonlyConfig = derived(nblocksConfig, ($config) => $config);

// Quick flag to know if config is ready
export const configReady = derived(nblocksConfig, ($c) => !!$c?.appId);

// Runtime initialization with external config (required)
export function initConfig(config: NblocksConfig) {
  if (!config?.appId) {
    throw new Error('nBlocks appId is required but was not provided in the configuration.');
  }
  const merged = {
    ...DEFAULT_CONFIG,
    ...config
  } as NblocksConfig;

  // Update sync cache first so logger can read debug flag
  _currentConfig = merged;
  nblocksConfig.set(merged);

  // This will only print when debug is true (logger checks getConfig().debug)
  logger.debug('[config] initialized', merged);  
}

// Synchronous access to latest config value
let _currentConfig: NblocksConfig | null = null;
nblocksConfig.subscribe((cfg) => {
  if (cfg) _currentConfig = cfg;
});

export function getConfig(): NblocksConfig {
  if (!_currentConfig) {
    throw new Error('Config has not been initialized. Call initConfig(...) early in app startup.');
  }
  return _currentConfig;
}
