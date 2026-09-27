/**
 * `useBridge()` — the `bridge` surface for the current component.
 *
 * Returns the module-level `bridge` singleton (`bridge.app`, `bridge.tenant`,
 * `bridge.user`, `bridge.usage`, `bridge.events`, `bridge.attributes`). Works
 * from anywhere — components, `.svelte.ts`, plain `.ts`, tests — because the
 * singleton always exists. `import { bridge }` and `useBridge()` are the same
 * object unless a parent component overrides it.
 *
 * Override: a parent component can call `setBridgeContext(fixture)` during its
 * initialisation, and every `useBridge()` below it returns the fixture. That is
 * for tests, Storybook and isolated previews — an app never needs it.
 *
 * TBP-697: exported from the package root. auth-core has a different
 * `useBridge` (the billing/quota factory); import quota numbers through
 * `useQuota(metric)` instead of reaching for that one.
 */
import { getContext, hasContext, setContext } from 'svelte';
import { bridge as _singleton, type BridgeSurface } from './bridge.js';

const BRIDGE_CONTEXT_KEY = Symbol('bridge-svelte:bridge');

/**
 * Put a different bridge surface into Svelte context for this component and
 * its children (tests, Storybook). Must be called during component
 * initialisation — Svelte's `setContext` contract.
 */
export function setBridgeContext(b: BridgeSurface): void {
  setContext(BRIDGE_CONTEXT_KEY, b);
}

/**
 * The bridge surface for the current component scope, falling back to the
 * module-level singleton outside components or when no parent overrode it.
 * Safe to call from any code path.
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
