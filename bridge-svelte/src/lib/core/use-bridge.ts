/**
 * Phase 4 (TBP-288/320) — `useBridge()` Svelte context hook.
 *
 * Default behavior: returns the module-level singleton `bridge` (from
 * `bridge.ts`). Works from any context — components, regular .ts modules,
 * tests — because the singleton is always available.
 *
 * Component-scoped override: a parent `<BridgeProvider>` may set a different
 * bridge instance into Svelte context. Useful for SSR, multi-tenant test
 * harnesses, or storybook fixtures that need isolated bridge state.
 *
 * Naming collision with auth-core's `useBridge` (billing/quota factory):
 * bridge-svelte's `useBridge()` SHADOWS the auth-core import. Consumers
 * who explicitly want the auth-core factory should import it as
 * `useBillingBridge` (alias added in auth-core re-exports in TBP-324).
 */
import { getContext, hasContext, setContext } from 'svelte';
import { bridge as _singleton, type BridgeSurface } from './bridge.js';

const BRIDGE_CONTEXT_KEY = Symbol('bridge-svelte:bridge');

/**
 * Set a bridge instance into Svelte context. Called by `<BridgeProvider>`
 * during component initialization. Calling this outside a component
 * initialization phase will throw (Svelte's `setContext` contract).
 */
export function setBridgeContext(b: BridgeSurface): void {
  setContext(BRIDGE_CONTEXT_KEY, b);
}

/**
 * Return the bridge surface for the current component scope, falling back
 * to the module-level singleton outside components (or when no provider
 * has been mounted). Safe to call from any code path.
 */
export function useBridge(): BridgeSurface {
  try {
    if (hasContext(BRIDGE_CONTEXT_KEY)) {
      const fromCtx = getContext<BridgeSurface | undefined>(BRIDGE_CONTEXT_KEY);
      if (fromCtx) return fromCtx;
    }
  } catch {
    // `getContext`/`hasContext` throw outside a component init phase —
    // fall through to the singleton, which is the right answer there.
  }
  return _singleton;
}
