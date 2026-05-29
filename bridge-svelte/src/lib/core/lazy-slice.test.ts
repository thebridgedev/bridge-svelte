// Phase 4 (TBP-322/323) — LazySlice tests.
//
// Verifies:
//   1. Initial value is null.
//   2. .load() resolves and populates the store; subsequent .load() returns
//      cached value without re-running the loader.
//   3. Concurrent .load() calls share the in-flight promise (no double-fetch).
//   4. force: true re-runs the loader.
//   5. Thenable: `await slice` triggers load + resolves to the value.
//   6. Error path: load failure populates .error AND throws; retry works.
//   7. apply(value) updates a loaded slice; no-op when not yet loaded.
//   8. preload(value) marks loaded + sets value; subsequent .load() returns
//      cached without invoking the loader.
//   9. loading reactivity: true during fetch, false after settle.
//  10. .subscribe() works as a Svelte store.

import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { LazySlice } from './lazy-slice.js';

const makeSlice = (loadImpl?: () => Promise<unknown>) => {
  const fn = vi.fn(loadImpl ?? (async () => ({ value: 42 })));
  return { slice: new LazySlice<unknown>({ load: fn }), fn };
};

describe('LazySlice (Phase 4, TBP-322/323)', () => {
  it('starts null', () => {
    const { slice } = makeSlice();
    expect(slice._peek()).toBeNull();
    expect(slice.isLoaded).toBe(false);
  });

  it('.load() populates store and marks isLoaded', async () => {
    const { slice, fn } = makeSlice();
    const v = await slice.load();
    expect(v).toEqual({ value: 42 });
    expect(slice._peek()).toEqual({ value: 42 });
    expect(slice.isLoaded).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('caches: second .load() does not re-invoke the loader', async () => {
    const { slice, fn } = makeSlice();
    await slice.load();
    await slice.load();
    await slice.load();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent .load() — single in-flight promise', async () => {
    let resolveLoader!: (v: unknown) => void;
    const fn = vi.fn(() => new Promise((r) => { resolveLoader = r; }));
    const slice = new LazySlice<unknown>({ load: fn });
    const p1 = slice.load();
    const p2 = slice.load();
    expect(fn).toHaveBeenCalledTimes(1);
    resolveLoader({ ok: true });
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toBe(b);
  });

  it('force: true re-invokes the loader', async () => {
    const { slice, fn } = makeSlice();
    await slice.load();
    await slice.load({ force: true });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('thenable: await slice triggers load + resolves to value', async () => {
    const { slice } = makeSlice();
    const v = await slice;
    expect(v).toEqual({ value: 42 });
    expect(slice.isLoaded).toBe(true);
  });

  it('rejects from load propagate AND populate .error', async () => {
    const fn = vi.fn(async () => {
      throw new Error('boom');
    });
    const slice = new LazySlice<unknown>({ load: fn });
    await expect(slice.load()).rejects.toThrow('boom');
    expect(get(slice.error)?.message).toBe('boom');
  });

  it('after error, next .load() retries (in-flight cleared)', async () => {
    let fail = true;
    const fn = vi.fn(async () => {
      if (fail) {
        fail = false;
        throw new Error('fail-first');
      }
      return { ok: true };
    });
    const slice = new LazySlice<unknown>({ load: fn });
    await expect(slice.load()).rejects.toThrow('fail-first');
    const v = await slice.load();
    expect(v).toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('apply(value) updates a LOADED slice (TBP-323)', async () => {
    const { slice } = makeSlice();
    await slice.load();
    slice.apply({ value: 99 });
    expect(slice._peek()).toEqual({ value: 99 });
  });

  it('apply(value) is a no-op when slice is NOT yet loaded', () => {
    const { slice } = makeSlice();
    slice.apply({ value: 99 });
    expect(slice._peek()).toBeNull();
    expect(slice.isLoaded).toBe(false);
  });

  it('preload(value) marks loaded + populates without invoking loader', async () => {
    const { slice, fn } = makeSlice();
    slice.preload({ preloaded: true });
    expect(slice._peek()).toEqual({ preloaded: true });
    expect(slice.isLoaded).toBe(true);
    const v = await slice.load();
    expect(v).toEqual({ preloaded: true });
    expect(fn).not.toHaveBeenCalled();
  });

  it('loading reactivity: true during fetch, false after settle', async () => {
    let resolveLoader!: (v: unknown) => void;
    const fn = vi.fn(() => new Promise((r) => { resolveLoader = r; }));
    const slice = new LazySlice<unknown>({ load: fn });
    const states: boolean[] = [];
    const unsub = slice.loading.subscribe((v) => states.push(v));
    const p = slice.load();
    expect(get(slice.loading)).toBe(true);
    resolveLoader({});
    await p;
    expect(get(slice.loading)).toBe(false);
    unsub();
    // sequence: initial false → true (start) → false (settle)
    expect(states).toEqual([false, true, false]);
  });

  it('.subscribe works as a Svelte store', async () => {
    const { slice } = makeSlice();
    const seen: unknown[] = [];
    const unsub = slice.subscribe((v) => seen.push(v));
    await slice.load();
    unsub();
    expect(seen[0]).toBeNull();
    expect(seen[seen.length - 1]).toEqual({ value: 42 });
  });

  it('initial option pre-seeds store + marks loaded', async () => {
    const fn = vi.fn(async () => ({ should_not_run: true }));
    const slice = new LazySlice<unknown>({ load: fn, initial: { seeded: 1 } });
    expect(slice._peek()).toEqual({ seeded: 1 });
    expect(slice.isLoaded).toBe(true);
    const v = await slice.load();
    expect(v).toEqual({ seeded: 1 });
    expect(fn).not.toHaveBeenCalled();
  });
});
