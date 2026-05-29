// bridge-svelte/flags — unit tests for the non-rune public surface (TBP-200).
//
// The runes-based pieces (`useFlag`, `<FeatureFlag>`, `flagStore`) require
// the Svelte compiler and are exercised by the demo app's Playwright E2E.
// Here we cover the auth-core re-exports, `BrowserIdentityStorage`, and
// the registry's `evaluateFlag` / change-bus.

import { describe, it, expect, beforeEach } from 'vitest';
import { BridgeFlags, MemoryIdentityStorage } from '@nebulr-group/bridge-auth-core';
import { BrowserIdentityStorage } from './bootstrap.js';
import {
  evaluateFlag,
  getBridgeFlagsInstance,
  setBridgeFlagsInstance,
  notifyFlagChanged,
  notifyAllFlagsChanged,
  subscribeToFlagChanges,
} from './registry.js';

describe('bridge-svelte/flags — registry', () => {
  beforeEach(() => {
    setBridgeFlagsInstance(undefined);
  });

  it('evaluateFlag returns the default when no instance is registered', () => {
    expect(getBridgeFlagsInstance()).toBeUndefined();
    expect(evaluateFlag('any.flag', 'fallback')).toEqual({ passed: false, value: 'fallback' });
  });

  it('evaluateFlag delegates to the registered BridgeFlags instance', () => {
    const bridge = new BridgeFlags();
    bridge.hydrate([
      {
        key: 'show_banner',
        state: 'on',
        valueType: 'boolean',
        offValue: false,
        onValue: true,
      },
    ]);
    setBridgeFlagsInstance(bridge);
    expect(evaluateFlag('show_banner', false)).toEqual({ passed: true, value: true });
    expect(evaluateFlag('missing_flag', 'default_value')).toEqual({ passed: false, value: 'default_value' });
  });

  it('subscribeToFlagChanges fires for notifyFlagChanged', () => {
    const events: Array<[string, unknown]> = [];
    const unsub = subscribeToFlagChanges((k, v) => events.push([k, v]));
    notifyFlagChanged('a', 1);
    notifyFlagChanged('a', 2);
    notifyAllFlagsChanged();
    unsub();
    notifyFlagChanged('a', 3); // ignored — unsubscribed
    expect(events).toEqual([
      ['a', 1],
      ['a', 2],
      ['*', undefined],
    ]);
  });

  it('subscriber exceptions do not break the notify path', () => {
    const unsub = subscribeToFlagChanges(() => {
      throw new Error('boom');
    });
    expect(() => notifyFlagChanged('x', 1)).not.toThrow();
    unsub();
  });
});

describe('bridge-svelte/flags — BridgeFlags re-export behavior', () => {
  it('supports per-call context overrides', () => {
    const bridge = new BridgeFlags();
    bridge.setContext({ identity: 'user-1', attributes: { plan: 'pro' } });
    const out = bridge.flag('unknown.flag', 'def', { identity: 'override' });
    expect(out.value).toBe('def');
    expect(bridge.getContext().identity).toBe('user-1');
  });
});

describe('bridge-svelte/flags — BrowserIdentityStorage', () => {
  it('throws when constructed outside a browser context', () => {
    // Vitest's 'node' environment has no window — this is the branch the
    // bootstrap auto-falls-back to MemoryIdentityStorage for.
    expect(() => new BrowserIdentityStorage('persistent')).toThrow(/requires a window/);
  });
});

describe('bridge-svelte/flags — MemoryIdentityStorage round-trip', () => {
  it('writes and reads the anon id', () => {
    const storage = new MemoryIdentityStorage('persistent');
    expect(storage.read()).toBeUndefined();
    storage.write('anon_xyz');
    expect(storage.read()).toBe('anon_xyz');
    storage.clear();
    expect(storage.read()).toBeUndefined();
  });
});
