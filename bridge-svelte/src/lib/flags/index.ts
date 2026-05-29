// bridge-svelte/flags — public barrel for the auth-free Feature Flags 2.0 entry point (TBP-200).
//
// Import from `@nebulr-group/bridge-svelte/flags` — this path is intentionally
// auth-free so apps in standalone-FF mode don't pull in BridgeAuth, the SSO
// chrome, Stripe, etc.

// Bootstrap + browser storage
export {
  createBridgeFlags,
  BrowserIdentityStorage,
  type CreateBridgeFlagsConfig,
  type BridgeFlagsBundle,
} from './bootstrap.js';

// Non-rune registry surface — safe in SSR / tests / plain TS contexts
export {
  evaluateFlag,
  setBridgeFlagsInstance,
  getBridgeFlagsInstance,
  notifyFlagChanged,
  notifyAllFlagsChanged,
  subscribeToFlagChanges,
} from './registry.js';

// Runes-based reactive helpers — pulls in `$state` / `$derived`, only safe
// inside Svelte components or other `.svelte.ts` modules.
export { useFlag, flagStore, _flagVersionsRune, type FlagStore } from './flag.svelte.js';

// Component
export { default as FeatureFlag } from './FeatureFlag.svelte';

// Reactive realtime connection status (subscribe in components to show
// offline indicators, retry banners, etc.).
export { realtimeStatus } from './realtime-status.js';
export type { ConnectionState } from '@nebulr-group/bridge-auth-core';

// Auth-core re-exports — consumers can stay on the `/flags` path without
// adding a direct dependency on `@nebulr-group/bridge-auth-core`.
export {
  BridgeFlags,
  MemoryIdentityStorage,
  attachIdentity,
  generateAnonymousId,
  BRIDGE_CONTEXT_HEADER,
  serializeContext,
  deserializeContext,
  serverInstanceId,
} from '@nebulr-group/bridge-auth-core';

export type {
  CachedFlag,
  FlagValueType,
  EvalTelemetry,
  DiscoveryTelemetry,
  BridgeFlagsHooks,
  DeclaredAttributeType,
  AttributeDeclaration,
  BridgeFlagsMode,
  EvalContext,
  IdentityStorage,
  AnonymousTrackingMode,
  BridgeIdentity,
  RealtimeMessage,
} from '@nebulr-group/bridge-auth-core';
