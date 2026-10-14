// TBP-813 — the one-shot "a checkout just finished" signal the landing page
// reads. In memory only; whoever shows it clears it, so it shows once.

import { afterEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  checkoutResult,
  clearCheckoutResult,
  markCheckoutComplete,
  takeCheckoutResult,
} from './checkout-result.js';

afterEach(() => clearCheckoutResult());

describe('checkoutResult — TBP-813', () => {
  it('starts empty', () => {
    expect(get(checkoutResult)).toBeNull();
    expect(takeCheckoutResult()).toBeNull();
  });

  it('markCheckoutComplete sets what the store reads', () => {
    markCheckoutComplete({ kind: 'checkout' });
    expect(get(checkoutResult)).toEqual({ kind: 'checkout' });
  });

  it('carries the plan name of a Free pick', () => {
    markCheckoutComplete({ kind: 'plan', planName: 'Free' });
    expect(get(checkoutResult)).toEqual({ kind: 'plan', planName: 'Free' });
  });

  it('a later result replaces an earlier one', () => {
    markCheckoutComplete({ kind: 'plan', planName: 'Free' });
    markCheckoutComplete({ kind: 'checkout' });
    expect(get(checkoutResult)).toEqual({ kind: 'checkout' });
  });

  it('takeCheckoutResult returns the result once, then nothing', () => {
    markCheckoutComplete({ kind: 'plan', planName: 'Pro' });
    expect(takeCheckoutResult()).toEqual({ kind: 'plan', planName: 'Pro' });
    expect(takeCheckoutResult()).toBeNull();
    expect(get(checkoutResult)).toBeNull();
  });

  it('clearCheckoutResult forgets it without showing it', () => {
    markCheckoutComplete({ kind: 'checkout' });
    clearCheckoutResult();
    expect(get(checkoutResult)).toBeNull();
    expect(takeCheckoutResult()).toBeNull();
  });

  it('subscribers see it set and then cleared', () => {
    const seen: unknown[] = [];
    const unsubscribe = checkoutResult.subscribe((v) => seen.push(v));
    markCheckoutComplete({ kind: 'checkout' });
    takeCheckoutResult();
    unsubscribe();
    expect(seen).toEqual([null, { kind: 'checkout' }, null]);
  });

  it('the exported store is read-only: apps cannot set it', () => {
    expect(typeof checkoutResult.subscribe).toBe('function');
    expect((checkoutResult as unknown as { set?: unknown }).set).toBeUndefined();
    expect((checkoutResult as unknown as { update?: unknown }).update).toBeUndefined();
  });
});
