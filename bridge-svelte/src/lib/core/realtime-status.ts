// bridge-svelte/core — reactive Svelte store for the realtime connection state.
//
// Lives in core because the Bridge realtime channel is a fundamental Bridge
// construct shared by flags AND billing (and any future capability that needs
// live updates). `<BridgeBootstrap />` mounts the connection; this store
// reflects its current state. Consumers subscribe in components to surface
// offline indicators, retry banners, etc.

import { writable, type Readable } from 'svelte/store';
import type { ConnectionState } from '@nebulr-group/bridge-auth-core';

const _store = writable<ConnectionState>('idle');

/** Reactive readable store of the current realtime connection state. */
export const realtimeStatus: Readable<ConnectionState> = _store;

/** Internal — set the current status. Only called by `startBridgeRuntime`. */
export function _setRealtimeStatus(state: ConnectionState): void {
  _store.set(state);
}
