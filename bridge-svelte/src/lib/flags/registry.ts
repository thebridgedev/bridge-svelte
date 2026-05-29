// bridge-svelte/flags — instance registry + change-notification bus.
//
// Plain TS (no runes), so it's safe to import from non-Svelte code paths
// like `bootstrap.ts`. The runes module (`flag.svelte.ts`) subscribes here
// to surface reactivity into components.

import type { BridgeFlags, EvalContext, FlagEvalResult } from '@nebulr-group/bridge-auth-core';

let _instance: BridgeFlags | undefined;
type Listener = (key: string | '*', value: unknown) => void;
const listeners = new Set<Listener>();

/** Register the BridgeFlags instance used by the framework helpers. */
export function setBridgeFlagsInstance(bridge: BridgeFlags | undefined): void {
  _instance = bridge;
}

/** Read the registered instance, or undefined if not yet bootstrapped. */
export function getBridgeFlagsInstance(): BridgeFlags | undefined {
  return _instance;
}

/** Subscribe to flag-change notifications. Returns an unsubscribe fn. */
export function subscribeToFlagChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Emit a flag-change notification. Listeners decide whether to re-render
 * based on the (key, value) pair — `key === '*'` means "all flags may
 * have changed" (e.g. a bulk hydrate).
 */
export function notifyFlagChanged(key: string, value: unknown): void {
  for (const l of Array.from(listeners)) {
    try {
      l(key, value);
    } catch {
      // listener errors must not break notify
    }
  }
}

/** Notify "everything may have changed". Used after bulk hydrates. */
export function notifyAllFlagsChanged(): void {
  for (const l of Array.from(listeners)) {
    try {
      l('*', undefined);
    } catch {
      // ignore
    }
  }
}

/**
 * Non-reactive flag read. Use inside a `$derived` (after registering a
 * subscription to `subscribeToFlagChanges`) if you need reactivity from a
 * component context.
 *
 * Pass `context` to override the SDK's global EvalContext for this single
 * call — useful for rules that target dev-supplied attributes (TBP-178 path).
 * Per-call attributes win on key collision (auth-core locked decision #20).
 */
export function evaluateFlag<T>(
  key: string,
  defaultValue: T,
  context?: Partial<EvalContext>,
): FlagEvalResult<T> {
  const inst = _instance;
  if (!inst) return { passed: false, value: defaultValue };
  return inst.flag<T>(key, defaultValue, context);
}
