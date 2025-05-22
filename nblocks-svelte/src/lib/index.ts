// Core stores and setup
export * from './client/stores/config.store.js';
export * from './client/stores/profile.store.js';

// Components (Svelte components must have `export default`)
export { default as Login } from './client/components/auth/Login.svelte';
export { default as FeatureFlag } from './client/components/FeatureFlag.svelte';
export { default as TeamManagement } from './client/components/team/TeamManagement.svelte';
export { default as NblocksBootStrap } from './client/NblocksBootStrap.svelte';

// Feature flags
export * from './shared/feature-flag.js';

// Auth route guards
export * from './auth/feature-flag-route-guard.js';
export * from './auth/route-guard.js';

// Types
export * from './shared/services/auth.service.js';
export * from './shared/profile.js'; // If this exists
export * from './shared/types/config.js';
