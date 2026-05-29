/**
 * Phase 4 (TBP-288/322/323) — `LazySlice<T>` — the reactive primitive for
 * snapshot-omitted slices.
 *
 * Each lazy slice (quotas, members, plans, settings, preferences, …) is a
 * `LazySlice<T>` instance. The class composes:
 *
 *   1. A Svelte `Readable` store of `T | null` — `null` until `.load()` has
 *      resolved at least once.
 *   2. A `.load()` method returning `Promise<T>` — idempotent and dedup-safe;
 *      concurrent callers share the in-flight fetch.
 *   3. A thenable bridge — `await bridge.tenant.quotas` triggers `.load()`
 *      and resolves to `T`. Conventional `$store` reads keep working too.
 *   4. An `apply(value)` setter for the reactive binding (TBP-323) — channel
 *      events (e.g. `quota.updated`) call this to keep loaded slices fresh
 *      without re-fetching.
 *   5. `.loading` and `.error` reactive companions for UI binding.
 *
 * The thenable trick: `await someObj` triggers `someObj.then(resolve, reject)`.
 * By implementing `then` on a non-Promise, we let `await bridge.tenant.quotas`
 * mean "load if needed, then give me the value" without breaking the
 * subscribable-store contract for `$bridge.tenant.quotas` consumers.
 */
import { writable, type Readable, type Writable } from 'svelte/store';

export type LoadFn<T> = () => Promise<T>;

export interface LazySliceOptions<T> {
  /** Called on first `.load()` (or first `await`). Idempotent: subsequent
   *  calls return the cached value unless `force: true` is passed. */
  load: LoadFn<T>;
  /** Optional initial value (e.g. seeded by tests). */
  initial?: T | null;
}

export class LazySlice<T> {
  // Subscribable; null until first successful load.
  private readonly _value: Writable<T | null>;
  private readonly _loading: Writable<boolean> = writable(false);
  private readonly _error: Writable<Error | null> = writable(null);

  private readonly _loadFn: LoadFn<T>;
  private _loaded = false;
  private _inflight: Promise<T> | null = null;

  readonly loading: Readable<boolean> = this._loading;
  readonly error: Readable<Error | null> = this._error;

  // Bound subscribe so consumers can use the LazySlice as a Svelte store:
  // `$bridge.tenant.quotas` works because Svelte unwraps via .subscribe.
  readonly subscribe: Readable<T | null>['subscribe'];

  constructor(opts: LazySliceOptions<T>) {
    this._loadFn = opts.load;
    this._value = writable(opts.initial ?? null);
    this.subscribe = this._value.subscribe;
    if (opts.initial !== undefined && opts.initial !== null) this._loaded = true;
  }

  /**
   * Load the slice value. Idempotent — calling more than once returns the
   * cached value unless `force: true` is passed (which re-runs the loader).
   * Concurrent callers share the in-flight promise.
   *
   * On error, the rejection propagates to the caller AND populates `.error`
   * for UI binding. Subsequent `.load()` calls after an error will retry
   * (in-flight is cleared in the catch handler).
   */
  async load(opts?: { force?: boolean }): Promise<T> {
    if (!opts?.force && this._loaded) {
      // Resolved already — `_value` holds T (asserted by `_loaded`).
      // svelte/store's get is not pulled in here to avoid the extra import
      // in the hot path; we read via a one-shot subscription.
      return this._peek() as T;
    }
    if (this._inflight) return this._inflight;

    this._loading.set(true);
    this._error.set(null);
    this._inflight = this._loadFn()
      .then((v) => {
        this._value.set(v);
        this._loaded = true;
        return v;
      })
      .catch((err) => {
        const e = err instanceof Error ? err : new Error(String(err));
        this._error.set(e);
        throw e;
      })
      .finally(() => {
        this._inflight = null;
        this._loading.set(false);
      });
    return this._inflight;
  }

  /**
   * TBP-323 — reactive binding for already-loaded slices. Channel handlers
   * (e.g. `quota.updated`) call this to push fresh values into the store
   * without re-fetching. No-op if the slice hasn't been loaded yet — there's
   * nothing to keep fresh, and the next `.load()` will fetch authoritatively.
   */
  apply(value: T): void {
    if (!this._loaded) return;
    this._value.set(value);
  }

  /** Force-set value AND mark loaded. Useful when a slice is hydrated by a
   *  push event before any consumer called `.load()`. */
  preload(value: T): void {
    this._value.set(value);
    this._loaded = true;
  }

  /** True iff `.load()` has resolved at least once OR `preload()` was called. */
  get isLoaded(): boolean {
    return this._loaded;
  }

  /** Make the slice thenable: `await bridge.tenant.quotas` triggers load. */
  then<TR = T, TE = never>(
    onFulfilled?: ((value: T) => TR | PromiseLike<TR>) | null,
    onRejected?: ((reason: unknown) => TE | PromiseLike<TE>) | null,
  ): Promise<TR | TE> {
    return this.load().then(onFulfilled as any, onRejected as any);
  }

  /** Test/internal: synchronously read the current value (or null). */
  _peek(): T | null {
    let v: T | null = null;
    const unsub = this._value.subscribe((x) => {
      v = x;
    });
    unsub();
    return v;
  }

  /** Test-only: reset internal state. */
  _resetForTests(): void {
    this._loaded = false;
    this._inflight = null;
    this._value.set(null);
    this._loading.set(false);
    this._error.set(null);
  }
}
