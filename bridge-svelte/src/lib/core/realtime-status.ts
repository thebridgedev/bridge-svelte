// bridge-svelte/core — reactive Svelte store for the realtime connection state.
//
// Lives in core because the Bridge realtime channel is a fundamental Bridge
// construct shared by flags AND billing (and any future capability that needs
// live updates). `<BridgeBootstrap />` mounts the connection; this store
// reflects its current state. Consumers subscribe in components to surface
// offline indicators, retry banners, etc.

import { writable, type Readable } from 'svelte/store';
import type { ConnectionState, RealtimeStatus } from '@nebulr-group/bridge-auth-core';
import { originNotAllowedHint } from '../shared/allowed-origins.js';

const _store = writable<ConnectionState>('idle');
const _detail = writable<RealtimeStatus>({ state: 'idle', retrying: false, since: Date.now() });

/** Reactive readable store of the current realtime connection state. */
export const realtimeStatus: Readable<ConnectionState> = _store;

/**
 * Reactive readable store of the full realtime status (TBP-644): `state`, and
 * when live updates are not working, the machine-readable `reason`, whose
 * `side` the fault is on (`app` / `config` / `bridge` / `network`), whether the
 * client is still `retrying`, a `docsUrl` and a support `ref`.
 *
 * A sibling of `realtimeStatus` rather than a change to it: that store is a
 * plain `ConnectionState` string that apps compare and render directly, so
 * widening its type would break them. `realtimeStatus` always equals
 * `realtimeStatusDetail.state`.
 */
export const realtimeStatusDetail: Readable<RealtimeStatus> = _detail;

/** Internal — set the current state. Only called by `startBridgeRuntime`. */
export function _setRealtimeStatus(state: ConnectionState): void {
  _store.set(state);
  // Keep the detail store in step when running on an auth-core that has no
  // status hook (only open/close/degraded). With the hook, the detail for
  // this state has already landed and is left alone.
  _detail.update((d) => (d.state === state ? d : { state, retrying: false, since: Date.now() }));
}

/**
 * TBP-669 — `origin_not_allowed` is fixed in the app's Bridge settings, not in
 * its code: side `config`, with the fix sentence. auth-core with TBP-669 sends
 * it that way; `/realtime/diagnose` itself says side `app`, which is what an
 * older auth-core passes through.
 */
export function normalizeRealtimeStatus(status: RealtimeStatus): RealtimeStatus {
  if (status.reason !== 'origin_not_allowed') return status;
  const hint = (status as RealtimeStatus & { hint?: string }).hint ?? originNotAllowedHint();
  const normalized: RealtimeStatus & { hint?: string } = { ...status, side: 'config', hint };
  return normalized;
}

/** Internal — set the full status. Only called by `startBridgeRuntime`. */
export function _setRealtimeStatusDetail(status: RealtimeStatus): void {
  _detail.set(normalizeRealtimeStatus(status));
  _store.set(status.state);
}
