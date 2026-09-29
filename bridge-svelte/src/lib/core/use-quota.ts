/**
 * TBP-697 — `useQuota(metric)`: one quota's numbers for your own UI, from the
 * Svelte plugin alone.
 *
 *   <script lang="ts">
 *     import { useQuota } from '@nebulr-group/bridge-svelte';
 *     const projects = useQuota('projects');
 *   </script>
 *
 *   {#if projects.loading}
 *     …
 *   {:else if projects.unlimited}
 *     Unlimited projects
 *   {:else}
 *     {projects.used} of {projects.limit} projects
 *   {/if}
 *
 * Reads the same live quota cache `<BridgeQuotaBanner>` does (auth-core's
 * `QuotaStore`: one `GET /usage/quota/:metric` on first read, then every
 * `quota.updated` push), so the numbers move on their own when usage changes.
 *
 * The one rule it exists to keep: **no number until there is a real one.**
 * While the first answer is in flight `loading` is true and `used`, `limit` and
 * `remaining` are `null` — never `0`, which would render "0 of 0" or, worse,
 * "0 used" on a workspace that is actually at its cap.
 *
 * `unlimited` is true once Bridge has answered that the workspace's plan puts
 * no quota on this metric — a real answer, distinct from `loading`.
 *
 * Reactive in a component or `.svelte.ts` (read the properties in markup or
 * `$derived`), and a plain point-in-time read anywhere else.
 */
import { createSubscriber } from 'svelte/reactivity';
import { useBridge as useBillingBridge, type QuotaSnapshot } from '@nebulr-group/bridge-auth-core';
import { tokenStore } from './bridge-instance.js';

type QuotaStore = ReturnType<typeof useBillingBridge>['quotas'];

export interface QuotaState {
  /** True until Bridge has answered for this metric. Numbers are `null` meanwhile. */
  readonly loading: boolean;
  /**
   * True once Bridge has answered that the plan puts no quota on this metric.
   * `used` / `limit` / `remaining` stay `null`: there is nothing to count against.
   */
  readonly unlimited: boolean;
  /**
   * How much is used. For a `counter` quota: this billing period's total. For a
   * `gauge` quota: how many exist right now. `null` while loading or unlimited.
   */
  readonly used: number | null;
  /** The plan's cap. `null` while loading or unlimited. */
  readonly limit: number | null;
  /** What is left before the cap, as Bridge computed it. `null` while loading or unlimited. */
  readonly remaining: number | null;
  /** `'approaching'` from 80%, `'critical'` from 95%. `null` below that, while loading, or unlimited. */
  readonly warningLevel: 'approaching' | 'critical' | null;
  /**
   * `'counter'` — Bridge counts it from `bridge.usage.report()` / your backend,
   * and it resets each period. `'gauge'` — your app says how many exist with
   * `usage.set()`, and it never resets. `null` while loading or unlimited.
   */
  readonly kind: 'counter' | 'gauge' | null;
  /** The full snapshot (policy, overage fields, …), or `null` while loading or unlimited. */
  readonly snapshot: QuotaSnapshot | null;
}

// ── Per-store bookkeeping ──────────────────────────────────────────────────────
//
// The QuotaStore answers "no quota on this plan" by DELETING the metric and
// notifying `undefined` — it keeps no record of the answer, and its
// `ensureHydrated()` refetches any metric it has no snapshot for. A reader that
// re-rendered on that notification would read again, refetch, be notified
// again, and loop one GET at a time for as long as the page is open. So the
// "Bridge said unlimited" answers are remembered here, once per store, and a
// remembered metric is not refetched until the workspace changes.
interface Tracking {
  unlimited: Set<string>;
  workspace: string | null | undefined;
}
const _tracking = new WeakMap<QuotaStore, Tracking>();

function tracking(store: QuotaStore): Tracking {
  let t = _tracking.get(store);
  if (!t) {
    t = { unlimited: new Set(), workspace: undefined };
    _tracking.set(store, t);
    const tr = t;
    store.subscribe((metric, snap) => {
      if (snap) tr.unlimited.delete(metric);
      else tr.unlimited.add(metric);
    });
  }
  return t;
}

/** `tid` from an access token, or null. Only used to notice a workspace switch. */
function workspaceOf(accessToken: string | null | undefined): string | null {
  if (!accessToken) return null;
  try {
    const part = accessToken.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const tid = (JSON.parse(json) as { tid?: unknown }).tid;
    return typeof tid === 'string' ? tid : null;
  } catch {
    return null;
  }
}

function noteWorkspace(t: Tracking, accessToken: string | null | undefined): void {
  const ws = workspaceOf(accessToken);
  // A different workspace (or signing in/out) is a different plan: an earlier
  // "unlimited" answer no longer holds.
  if (t.workspace !== undefined && ws !== t.workspace) t.unlimited.clear();
  t.workspace = ws;
}

function readState(metric: string): QuotaState {
  let store: QuotaStore;
  try {
    store = useBillingBridge().quotas;
  } catch {
    return EMPTY_LOADING;
  }
  const t = tracking(store);
  let snap = store.get(metric);
  if (!snap && !t.unlimited.has(metric)) {
    // First read, or a read before sign-in configured the store: ask. The
    // store dedupes in-flight requests, so repeated reads cost nothing.
    snap = store.ensureHydrated(metric);
  }
  if (snap) {
    return {
      loading: false,
      unlimited: false,
      used: snap.used,
      limit: snap.limit,
      remaining: snap.remaining,
      warningLevel: snap.warningLevel ?? null,
      // Servers that predate gauges send no kind: those quotas are counters.
      kind: snap.kind === 'gauge' ? 'gauge' : 'counter',
      snapshot: snap,
    };
  }
  if (t.unlimited.has(metric)) return UNLIMITED;
  return EMPTY_LOADING;
}

const EMPTY_LOADING: QuotaState = Object.freeze({
  loading: true,
  unlimited: false,
  used: null,
  limit: null,
  remaining: null,
  warningLevel: null,
  kind: null,
  snapshot: null,
});

const UNLIMITED: QuotaState = Object.freeze({
  loading: false,
  unlimited: true,
  used: null,
  limit: null,
  remaining: null,
  warningLevel: null,
  kind: null,
  snapshot: null,
});

/**
 * Live numbers for one quota metric.
 *
 * @param metric The metric key (`'projects'`, `'ai_completions'`, `'seats'`).
 *   Pass a getter (`() => metric`) when the key is itself reactive, e.g. a prop.
 */
export function useQuota(metric: string | (() => string)): QuotaState {
  const key = typeof metric === 'function' ? metric : () => metric;

  const subscribe = createSubscriber((update) => {
    let store: QuotaStore;
    try {
      store = useBillingBridge().quotas;
    } catch {
      return;
    }
    tracking(store);
    const offQuota = store.subscribe((m) => {
      if (m === key()) update();
    });
    const offToken = tokenStore.subscribe((tokens) => {
      noteWorkspace(tracking(store), tokens?.accessToken);
      // A token arriving is what lets a pre-sign-in read finally hydrate. The
      // runtime reconfigures the store from the same token store, possibly
      // after this callback — read again once that has happened.
      queueMicrotask(update);
    });
    return () => {
      offQuota();
      offToken();
    };
  });

  const current = (): QuotaState => {
    subscribe();
    return readState(key());
  };

  return {
    get loading() {
      return current().loading;
    },
    get unlimited() {
      return current().unlimited;
    },
    get used() {
      return current().used;
    },
    get limit() {
      return current().limit;
    },
    get remaining() {
      return current().remaining;
    },
    get warningLevel() {
      return current().warningLevel;
    },
    get kind() {
      return current().kind;
    },
    get snapshot() {
      return current().snapshot;
    },
  };
}
