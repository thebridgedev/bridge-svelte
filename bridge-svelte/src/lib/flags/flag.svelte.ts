// bridge-svelte/flags — Svelte 5 runes-based reactive flag access (TBP-200).
//
// Thin wrapper around `registry.ts`. The runes here drive component
// reactivity; non-rune code (bootstrap, tests, server contexts) should
// import directly from `./registry.js`.

import type { EvalContext, FlagEvalResult } from '@nebulr-group/bridge-auth-core';
import { evaluateFlag, subscribeToFlagChanges } from './registry.js';

// Per-flag version counter. Mutating the Map reference forces $derived
// readers to re-run.
let versions = $state.raw<Map<string, number>>(new Map());
const lastSeenValue = new Map<string, unknown>();

function bumpVersion(key: string): void {
  const next = new Map(versions);
  next.set(key, (next.get(key) ?? 0) + 1);
  versions = next;
}

// Wire the registry's change-bus to our reactive map. The subscription
// lives for the lifetime of the module — there's only one Svelte runtime
// per app, so no leak concerns.
subscribeToFlagChanges((key, value) => {
  if (key === '*') {
    versions = new Map();
    lastSeenValue.clear();
    return;
  }
  const prev = lastSeenValue.get(key);
  if (prev !== undefined && sameValue(prev, value)) return;
  lastSeenValue.set(key, value);
  bumpVersion(key);
});

/**
 * Internal — read the reactive versions map. Returning the map (rather than
 * the version number for a specific key) keeps the dependency graph simple:
 * any consumer reading from the map subscribes to it.
 */
export function _flagVersionsRune(): Map<string, number> {
  return versions;
}

/**
 * Reactive flag accessor. Inputs may be literal values (snapshotted at
 * call time) OR zero-arg getter functions (re-read on every derivation).
 *
 *   const banner = useFlag('show_banner', false);
 *   {#if banner.value}<Banner />{/if}
 *
 *   const themed = useFlag(() => themeName, () => 'default');
 *
 * Pass `context` (literal or getter) to drive rule eval with dev-supplied
 * attributes — e.g. `useFlag('enterprise-feature', false, () => ({ attributes: { plan } }))`.
 */
export function useFlag<T>(
  key: string | (() => string),
  defaultValue: T | (() => T),
  context?: Partial<EvalContext> | (() => Partial<EvalContext> | undefined),
): { readonly value: T; readonly passed: boolean } {
  const getKey = typeof key === 'function' ? (key as () => string) : () => key;
  const getDefault =
    typeof defaultValue === 'function' ? (defaultValue as () => T) : () => defaultValue;
  const getContext =
    typeof context === 'function'
      ? (context as () => Partial<EvalContext> | undefined)
      : () => context;

  const resultDerived = $derived.by((): FlagEvalResult<T> => {
    const k = getKey();
    versions.get(k);
    return evaluateFlag<T>(k, getDefault(), getContext());
  });

  return {
    get value() {
      return resultDerived.value;
    },
    get passed() {
      return resultDerived.passed;
    },
  };
}

/**
 * Svelte-store-shaped subscribe API. Returns `{ subscribe }` so it can be
 * used with the `$store` auto-subscription syntax in components.
 */
export interface FlagStore<T> {
  subscribe: (run: (value: FlagEvalResult<T>) => void) => () => void;
}

export function flagStore<T>(
  key: string,
  defaultValue: T,
  context?: Partial<EvalContext>,
): FlagStore<T> {
  return {
    subscribe(run) {
      const cleanup = $effect.root(() => {
        $effect(() => {
          versions.get(key);
          run(evaluateFlag<T>(key, defaultValue, context));
        });
      });
      return cleanup;
    },
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}
