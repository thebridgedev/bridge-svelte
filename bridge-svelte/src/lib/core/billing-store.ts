/**
 * TBP-762 — the billing store's refresh rule.
 *
 * The plan list, the current plan (`subscriptionStore`) and the canonical
 * billing state (`useBridge().subscription`, what <BridgeSubscriptionStatus>
 * and <BridgeBillingNotice> read) are re-read together, on one rule:
 *
 *   - when the sign-in is renewed (a new access token: refresh, sign-in, a
 *     plan change that re-minted it);
 *   - on a live billing event (plan change, subscription or payment lifecycle);
 *   - when the tab regains focus and the last read is older than 30 seconds;
 *   - one retry when a read fails.
 *
 * Screens call `ensureBilling()` / `ensureBillingState()` on mount and read the
 * stores; they do not fetch on their own. Only what some screen has asked for
 * is re-read, so an app that never shows billing makes no extra calls.
 *
 * Every read passes `onTokenStale`: right after a checkout Bridge marks the
 * sign-in out of date, and a billing read in that window used to answer 401
 * `TOKEN_VERSION_STALE` and leave "Subscription unavailable" until a reload.
 */
import {
  fetchBillingState,
  useBridge as useBillingBridge,
  type BridgeAuth,
  type MountOptions,
} from '@nebulr-group/bridge-auth-core';
import {
  billingRetryDelay,
  ensureSubscription,
  getBridgeAuth,
  loadSubscription,
  subscriptionWanted,
  tokenStore,
} from './bridge-instance.js';
import { logger } from '../shared/logger.js';

/** A read older than this is re-read when the tab regains focus. */
export const BILLING_STALE_AFTER_MS = 30_000;

/**
 * `auth.tokenStaleHandler()` when the installed auth-core has it (0.8.0-beta.5+
 * — the peer range still admits older ones, which simply do not retry).
 */
export function tokenStaleHandlerOf(auth: BridgeAuth): (() => Promise<string | null>) | undefined {
  const a = auth as BridgeAuth & { tokenStaleHandler?: () => () => Promise<string | null> };
  return typeof a.tokenStaleHandler === 'function' ? a.tokenStaleHandler() : undefined;
}

/**
 * HTTP options for a billing or quota read made by the plugin: the current
 * token, and the handler that renews an out-of-date one. Null when signed out.
 */
export function billingReadOptions(apiBaseUrl?: string): MountOptions | null {
  const auth = getBridgeAuth();
  const ctx = auth.getApiContext();
  if (!ctx.accessToken) return null;
  return {
    apiBaseUrl: apiBaseUrl ?? ctx.apiBaseUrl,
    accessToken: ctx.accessToken,
    appId: ctx.appId,
    onTokenStale: tokenStaleHandlerOf(auth),
  };
}

// ── Canonical billing state (`useBridge().subscription`) ──────────────────────

let _stateInflight: Promise<void> | null = null;
let _stateAgain = false;
let _stateLoadedAt = 0;
let _stateWanted = false;
let _stateToken: string | null = null;

/** Re-read the canonical billing state. Never rejects. */
export function refreshBillingState(): Promise<void> {
  _stateWanted = true;
  if (_stateInflight) {
    _stateAgain = true;
    return _stateInflight;
  }
  _stateInflight = (async () => {
    try {
      do {
        _stateAgain = false;
        await readStateOnce();
      } while (_stateAgain);
    } finally {
      _stateInflight = null;
    }
  })();
  return _stateInflight;
}

/** Read the canonical billing state unless a read younger than `maxAgeMs` exists. */
export function ensureBillingState(maxAgeMs = BILLING_STALE_AFTER_MS): Promise<void> {
  if (_stateInflight) return _stateInflight;
  const sub = useBillingBridge().subscription;
  if (_stateLoadedAt > 0 && sub.snapshot().state && Date.now() - _stateLoadedAt < maxAgeMs) {
    return Promise.resolve();
  }
  return refreshBillingState();
}

async function readStateOnce(): Promise<void> {
  const sub = useBillingBridge().subscription;
  const hadState = sub.snapshot().state !== null;
  // Only a first read shows "Loading…"; a re-read keeps the plan on screen.
  if (!hadState) {
    sub.setError(null);
    sub.setLoading(true);
  }
  try {
    for (let attempt = 0; ; attempt++) {
      let opts: MountOptions | null = null;
      try {
        opts = billingReadOptions();
      } catch {
        // Bridge not initialised yet (SSR, a component rendered outside <BridgeBootstrap>).
      }
      if (!opts) {
        if (!sub.snapshot().state) sub.setError('Not authenticated');
        return;
      }
      try {
        const state = await fetchBillingState(opts, logger);
        // Signed out or switched workspace meanwhile: not this session's plan.
        if (tokenChangedWorkspace(opts.accessToken)) return;
        sub.hydrate(state);
        _stateLoadedAt = Date.now();
        return;
      } catch (err) {
        if (attempt === 0) {
          // The one retry. "Loading…" stays up meanwhile — a checkout that is
          // still being confirmed is not an error.
          await new Promise((r) => setTimeout(r, billingRetryDelay()));
          continue;
        }
        const message = err instanceof Error ? err.message : 'Failed to load billing state';
        logger.warn('[bridge-billing] billing state read failed:', message);
        if (!sub.snapshot().state) sub.setError(message);
        return;
      }
    }
  } finally {
    if (!hadState) sub.setLoading(false);
  }
}

function workspaceOf(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { tid?: unknown };
    return typeof json.tid === 'string' ? json.tid : null;
  } catch {
    return null;
  }
}

/** True when the session now belongs to a different workspace (or none) than `token`. */
function tokenChangedWorkspace(token: string): boolean {
  let now: string | null = null;
  try {
    now = billingReadOptions()?.accessToken ?? null;
  } catch {
    /* not initialised: treat as signed out */
  }
  if (!now) return true;
  return workspaceOf(now) !== workspaceOf(token);
}

// ── Both, on one rule ─────────────────────────────────────────────────────────

/**
 * Re-read everything some screen has asked for: the plan list + current plan,
 * and the canonical billing state. What the checkout return, a plan change and
 * every trigger of the refresh rule call. Never rejects.
 */
export async function refreshBilling(): Promise<void> {
  try {
    const reads: Promise<void>[] = [];
    if (subscriptionWanted()) reads.push(loadSubscription());
    if (_stateWanted || stateInStore()) reads.push(refreshBillingState());
    await Promise.all(reads);
  } catch (err) {
    // Bridge not initialised (SSR, tests): nothing to re-read.
    logger.debug('[bridge-billing] refresh skipped:', err);
  }
}

/** On mount: read what has not been read, or was read more than 30 s ago. */
export async function ensureBilling(maxAgeMs = BILLING_STALE_AFTER_MS): Promise<void> {
  try {
    await Promise.all([ensureSubscription(maxAgeMs), ensureBillingState(maxAgeMs)]);
  } catch (err) {
    logger.debug('[bridge-billing] ensure skipped:', err);
  }
}

function stateInStore(): boolean {
  try {
    return useBillingBridge().subscription.snapshot().state !== null;
  } catch {
    return false;
  }
}

/** Live events after which the billing stores are re-read. */
export const BILLING_REFRESH_EVENTS: ReadonlySet<string> = new Set([
  'subscription.plan_changed',
  'subscription.created',
  'subscription.updated',
  'subscription.canceled',
  'subscription.reactivated',
  'subscription.trial_started',
  'subscription.trial_converted',
  'subscription.trial_expired',
  'payment.succeeded',
  'payment.failed',
  'dunning.recovered',
  'dunning.exhausted',
]);

/** The runtime calls this for every realtime billing event. */
export function billingEventReceived(kind: string): void {
  if (!BILLING_REFRESH_EVENTS.has(kind)) return;
  void refreshBilling();
}

/**
 * Install the sign-in-renewal and tab-focus triggers. Client only; returns the
 * stop function. Idempotent: a second call replaces the first.
 */
let _stop: (() => void) | null = null;
export function startBillingRefresh(): () => void {
  _stop?.();
  let first = true;
  const offToken = tokenStore.subscribe((tokens) => {
    const token = tokens?.accessToken ?? null;
    // The synchronous first emission is the current token, not a renewal.
    if (first) {
      first = false;
      _stateToken = token;
      return;
    }
    if (token === _stateToken) return;
    _stateToken = token;
    if (token) void refreshBilling();
  });

  const onFocus = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    try {
      if (!getBridgeAuth().getApiContext().accessToken) return;
    } catch {
      return;
    }
    const reads: Promise<void>[] = [];
    if (subscriptionWanted()) reads.push(ensureSubscription(BILLING_STALE_AFTER_MS));
    if (_stateWanted || stateInStore()) reads.push(ensureBillingState(BILLING_STALE_AFTER_MS));
    void Promise.all(reads);
  };
  const win = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null;
  const doc = typeof document !== 'undefined' && typeof document.addEventListener === 'function' ? document : null;
  win?.addEventListener('focus', onFocus);
  doc?.addEventListener('visibilitychange', onFocus);

  const stop = () => {
    offToken();
    win?.removeEventListener('focus', onFocus);
    doc?.removeEventListener('visibilitychange', onFocus);
    if (_stop === stop) _stop = null;
  };
  _stop = stop;
  return stop;
}

/**
 * TBP-763 — re-read one quota now (after a team change, for the seats metric).
 * A live `quota.updated` push may also arrive; whichever is newer wins.
 */
export function refreshQuota(metric: string): void {
  try {
    const quotas = useBillingBridge().quotas as unknown as {
      reconcileAfterReport?: (metric: string, delayMs?: number) => void;
    };
    quotas.reconcileAfterReport?.(metric, 0);
  } catch (err) {
    logger.debug('[bridge-billing] quota re-read skipped:', err);
  }
}

/** Test-only. */
export function __resetBillingStoreForTests(): void {
  _stop?.();
  _stop = null;
  _stateInflight = null;
  _stateAgain = false;
  _stateLoadedAt = 0;
  _stateWanted = false;
  _stateToken = null;
}
