/**
 * TBP-697 — `entitlements`: the workspace's plan entitlements as one Svelte
 * store, from the Svelte plugin alone.
 *
 *   <script lang="ts">
 *     import { entitlements } from '@nebulr-group/bridge-svelte';
 *   </script>
 *
 *   {#if !$entitlements.ready}
 *     …
 *   {:else if $entitlements.can('ai_completions')}
 *     <AiPanel />
 *   {:else}
 *     Upgrade to use AI
 *   {/if}
 *
 * `can(key)` is fail-closed: `false` until Bridge has answered, and `false` for
 * a key the plan does not grant. `ready` is what tells those two apart — check
 * it before treating a `false` as "this plan cannot", so a cold start shows a
 * spinner instead of a paywall.
 *
 * It moves on its own: the session snapshot fills it on connect, and every
 * `entitlements.changed` push (a plan change, a hard quota reaching its cap)
 * replaces it. Signing out empties it.
 */
import { derived, readable, type Readable } from 'svelte/store';
import { useBridge as useBillingBridge } from '@nebulr-group/bridge-auth-core';
import { tokenStore } from './bridge-instance.js';
import { tenantEntitlementsStore } from './snapshot-stores.js';

export interface EntitlementsState {
  /** True once Bridge has answered for this session. Before that, every `can()` is `false`. */
  readonly ready: boolean;
  /** Fail-closed: `true` only when the plan grants `key`. */
  can(key: string): boolean;
  /** Every entitlement Bridge sent, as `{ key: boolean }`. Empty until `ready`. */
  readonly all: Readonly<Record<string, boolean>>;
}

/**
 * auth-core's own entitlement cache, as a store. It receives the same pushes
 * as the session snapshot store; it is the fallback for the moment before the
 * first snapshot lands.
 */
const coreEntitlements: Readable<Record<string, boolean> | null> = readable<Record<string, boolean> | null>(
  null,
  (set) => {
    let store: ReturnType<typeof useBillingBridge>['entitlementsStore'];
    try {
      store = useBillingBridge().entitlementsStore;
    } catch {
      return;
    }
    const read = () => {
      const hydrated = typeof store.isHydrated === 'function' ? store.isHydrated() : false;
      set(hydrated ? store.all() : null);
    };
    read();
    return store.subscribe(read);
  },
);

function stateOf(map: Record<string, boolean> | null): EntitlementsState {
  const all = Object.freeze({ ...(map ?? {}) });
  return Object.freeze({
    ready: map !== null,
    all,
    can: (key: string) => all[key] === true,
  });
}

const NOT_READY = stateOf(null);

export const entitlements: Readable<EntitlementsState> = derived(
  [tokenStore, tenantEntitlementsStore, coreEntitlements],
  ([tokens, snapshot, core]) => {
    // Signed out: whatever the last session was entitled to is not this one's.
    if (!tokens?.accessToken) return NOT_READY;
    return stateOf(snapshot ?? core);
  },
);
