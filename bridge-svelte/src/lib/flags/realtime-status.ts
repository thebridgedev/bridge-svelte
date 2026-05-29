// Backward-compat re-export. The implementation moved to `core/realtime-status.ts`
// because the realtime channel is a Bridge-level construct (flags + billing both
// ride it). Imports from `@nebulr-group/bridge-svelte/flags` keep working.
export { realtimeStatus, _setRealtimeStatus } from '../core/realtime-status.js';
