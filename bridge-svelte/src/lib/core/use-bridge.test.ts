// Phase 4 (TBP-288/320) — useBridge hook tests.
//
// Verifies:
//   1. Outside a component (regular .ts module / vitest test), useBridge()
//      returns the singleton without throwing.
//   2. setBridgeContext outside a component scope throws (Svelte contract);
//      useBridge() catches and falls back to the singleton.
//   3. Provided override via Svelte context wins over the singleton —
//      covered by integration in BridgeProvider.test.ts where a real
//      component mount sets context.

import { describe, expect, it } from 'vitest';
import { useBridge } from './use-bridge.js';
import { bridge as singleton } from './bridge.js';

describe('useBridge() — outside component scope (Phase 4, TBP-320)', () => {
  it('returns the singleton when called from regular .ts code', () => {
    expect(useBridge()).toBe(singleton);
  });

  it('does not throw even when no Svelte context is available', () => {
    expect(() => useBridge()).not.toThrow();
  });

  it('returns a stable reference across calls', () => {
    expect(useBridge()).toBe(useBridge());
  });
});
