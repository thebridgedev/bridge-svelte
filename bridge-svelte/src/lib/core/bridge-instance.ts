/**
 * Singleton BridgeAuth instance + Svelte store adapter.
 *
 * This is the architectural keystone of the bridge-svelte ↔ auth-core integration.
 * It creates a single BridgeAuth instance and wires its events to Svelte stores
 * so that consumers can keep using `$auth.isAuthenticated`, `$profileStore.profile`, etc.
 */
import { BridgeAuth, type AppConfig, type AuthState, type BridgeAuthConfig, type Plan, type Profile, type SubscriptionStatus, type TenantUser, type TokenSet } from '@nebulr-group/bridge-auth-core';
import { derived, get, writable, type Readable, type Writable } from 'svelte/store';
import { logger } from '../shared/logger.js';

// ── Singleton ──────────────────────────────────────────────────────────────────

let _instance: BridgeAuth | null = null;

// ── Svelte stores (writable internally, exported as readable) ──────────────────

const _tokens: Writable<TokenSet | null> = writable(null);
const _appConfig: Writable<AppConfig | null> = writable(null);
const _profile: Writable<Profile | null | undefined> = writable(undefined);
const _authState: Writable<AuthState> = writable('unauthenticated');
const _isLoading: Writable<boolean> = writable(true);
const _error: Writable<string | null> = writable(null);
const _tenantUsers: Writable<TenantUser[]> = writable([]);

const _isAuthenticated: Readable<boolean> = derived(_tokens, ($t) => !!$t?.accessToken);
const _isOnboarded: Readable<boolean> = derived(_profile, ($p) => $p?.onboarded ?? false);
const _hasMultiTenantAccess: Readable<boolean> = derived(_profile, ($p) => $p?.multiTenantAccess ?? false);

// ── Ready gate ─────────────────────────────────────────────────────────────────

const _ready: Writable<boolean> = writable(false);
let _resolveReady: (() => void) | null = null;
const _readyPromise = new Promise<void>((resolve) => {
  _resolveReady = resolve;
});

// ── App config load gate ───────────────────────────────────────────────────────
//
// The anonymous app config drives SSO button visibility, signup/magic-link
// toggles, etc. on LoginForm. We cache the in-flight fetch so concurrent
// callers share a single network request and can await the result.
let _appConfigPromise: Promise<AppConfig | null> | null = null;

// ── Init / access ──────────────────────────────────────────────────────────────

export function initBridge(config: BridgeAuthConfig): BridgeAuth {
  if (_instance) {
    logger.debug('[bridge-instance] already initialized, returning existing');
    return _instance;
  }

  _instance = new BridgeAuth(config);

  // Seed stores from current auth-core state
  const existingTokens = _instance.getTokens();
  if (existingTokens) {
    _tokens.set(existingTokens);
    // Fetch profile for existing tokens
    _instance.getProfile().then((p) => _profile.set(p ?? null)).catch((err) => logger.warn('[bridge-instance] profile fetch failed:', err));
  }
  _authState.set(_instance.getAuthState());
  _isLoading.set(false);

  // Wire auth-core events → Svelte stores
  _instance.on('auth:login', (tokens) => {
    _tokens.set(tokens);
    _instance!.getProfile().then((p) => _profile.set(p ?? null)).catch((err) => logger.warn('[bridge-instance] profile fetch failed:', err));
  });

  _instance.on('auth:logout', () => {
    _tokens.set(null);
    _profile.set(null);
    // TBP-762 — the next user must not see this one's plan.
    resetSubscription();
  });

  _instance.on('auth:token-refreshed', (tokens) => {
    _tokens.set(tokens);
  });

  _instance.on('auth:state-change', (state) => {
    _authState.set(state);
    if (state === 'tenant-selection') {
      _tenantUsers.set(_instance!.getTenantUsers());
    } else if (state === 'authenticated' || state === 'unauthenticated') {
      _tenantUsers.set([]);
    }
  });

  _instance.on('auth:profile', (profile) => {
    _profile.set(profile);
  });

  _instance.on('auth:workspace-changed', (tokens) => {
    _tokens.set(tokens);
    resetSubscription();
    _instance!.getProfile().then((p) => _profile.set(p ?? null)).catch((err) => logger.warn('[bridge-instance] profile fetch failed:', err));
  });

  _instance.on('auth:error', (err) => {
    _error.set(err.message);
  });

  logger.debug('[bridge-instance] initialized');
  return _instance;
}

/**
 * Load the anonymous app config into `appConfigStore` if it isn't already.
 *
 * Idempotent: concurrent callers share the in-flight fetch, and once the
 * store holds a value this function resolves immediately.
 *
 * Resolves with the loaded config on success or `null` on failure (the
 * fetch error is logged — it is not silently swallowed).
 */
export function ensureAppConfig(): Promise<AppConfig | null> {
  const existing = get(_appConfig);
  if (existing) return Promise.resolve(existing);
  if (_appConfigPromise) return _appConfigPromise;

  _appConfigPromise = getBridgeAuth()
    .getAppConfig()
    .then((cfg) => {
      _appConfig.set(cfg);
      return cfg;
    })
    .catch((err) => {
      logger.warn('[bridge-instance] getAppConfig failed:', err);
      // Allow a later call to retry
      _appConfigPromise = null;
      return null;
    });

  return _appConfigPromise;
}

export function getBridgeAuth(): BridgeAuth {
  if (!_instance) {
    throw new Error('BridgeAuth not initialized. Call initBridge() first (via bridgeConfig.initConfig).');
  }
  return _instance;
}

export function markReady(): void {
  if (get(_ready)) return;
  _ready.set(true);
  _resolveReady?.();
}

export function waitForBridge(): Promise<void> {
  return _readyPromise;
}

// ── Store exports ──────────────────────────────────────────────────────────────

/** Token store — readable. Use `getBridgeAuth()` methods to mutate. */
export const tokenStore: Readable<TokenSet | null> = _tokens;

/** Whether user is authenticated */
export const isAuthenticated: Readable<boolean> = _isAuthenticated;

/** Auth loading state */
export const isLoading: Readable<boolean> = _isLoading;

/** Last auth error */
export const authError: Readable<string | null> = _error;

/** Current auth state machine state */
export const authState: Readable<AuthState> = _authState;

/** User profile (undefined = loading, null = no profile, Profile = loaded) */
export const profileStore: Readable<Profile | null | undefined> = _profile;

/** Whether user has completed onboarding */
export const isOnboarded: Readable<boolean> = _isOnboarded;

/** Whether user has access to multiple tenants */
export const hasMultiTenantAccess: Readable<boolean> = _hasMultiTenantAccess;

/** Tenant users for multi-tenant selection */
export const tenantUsersStore: Readable<TenantUser[]> = _tenantUsers;

/** Bridge ready state */
export const bridgeReadyStore: Readable<boolean> = _ready;

/** App-level config (SSO providers, feature flags, etc.) — loaded anonymously on init */
export const appConfigStore: Readable<AppConfig | null> = _appConfig;

// ── Subscription store ─────────────────────────────────────────────────────

export interface SubscriptionState {
  status: SubscriptionStatus | null;
  plans: Plan[] | null;
  loading: boolean;
  error: string | null;
}

const _subscriptionWritable: Writable<SubscriptionState> = writable({
  status: null,
  plans: null,
  loading: false,
  error: null,
});

/** Subscription status + plan list */
export const subscriptionStore: Readable<SubscriptionState> = _subscriptionWritable;

// TBP-762 — one refresh rule for the plan list and the current plan.
//
// Every screen used to fetch on its own and only when `status` was missing, so
// a list loaded once was served for the life of the tab: a plan added in Bridge
// never appeared, and the list a checkout had just changed stayed stale. Now:
//   - concurrent calls share one read, and a call made while a read is in
//     flight gets a second read after it — the caller asked because something
//     changed, and the in-flight answer may predate that;
//   - a read that fails, or answers with an empty plan list, is retried once;
//   - a background re-read never blanks what is on screen: `loading` is only
//     true while there is nothing to show, and a failed re-read keeps the last
//     good answer instead of replacing it with an error;
//   - an answer that arrives after sign-out or a workspace switch is dropped.
// `core/billing-store.ts` decides WHEN to re-read (sign-in renewal, live
// billing events, tab focus after 30 s); this function is HOW.

/** Delay before the one retry of a failed or empty read. */
let _retryDelayMs = 1000;
/** Test-only: shorten the retry delay. */
export function __setBillingRetryDelay(ms: number): void {
  _retryDelayMs = ms;
}
export function billingRetryDelay(): number {
  return _retryDelayMs;
}

let _subInflight: Promise<void> | null = null;
let _subAgain = false;
let _subLoadedAt = 0;
let _subWanted = false;
/** Bumped on sign-out and workspace switch; a read started before is discarded. */
let _subGeneration = 0;

function resetSubscription(): void {
  _subGeneration += 1;
  _subLoadedAt = 0;
  _subscriptionWritable.set({ status: null, plans: null, loading: false, error: null });
}

/** When the plan list and status were last read successfully (ms epoch), 0 if never. */
export function subscriptionLoadedAt(): number {
  return _subLoadedAt;
}

/** True once any screen has asked for the plan list / status in this session. */
export function subscriptionWanted(): boolean {
  return _subWanted;
}

/** Re-read the plan list and the current plan. Never rejects. */
export function loadSubscription(): Promise<void> {
  _subWanted = true;
  if (_subInflight) {
    _subAgain = true;
    return _subInflight;
  }
  _subInflight = (async () => {
    try {
      do {
        _subAgain = false;
        await readSubscriptionOnce();
      } while (_subAgain);
    } finally {
      _subInflight = null;
    }
  })();
  return _subInflight;
}

/**
 * Read only when nothing has been read yet or the last read is older than
 * `maxAgeMs`. What screens call on mount instead of fetching on their own.
 */
export function ensureSubscription(maxAgeMs = 30_000): Promise<void> {
  if (_subInflight) return _subInflight;
  if (_subLoadedAt > 0 && Date.now() - _subLoadedAt < maxAgeMs) return Promise.resolve();
  return loadSubscription();
}

async function readSubscriptionOnce(): Promise<void> {
  const generation = _subGeneration;
  const current = get(_subscriptionWritable);
  const hasData = current.status !== null || current.plans !== null;
  if (!hasData) _subscriptionWritable.update((s) => ({ ...s, loading: true, error: null }));

  for (let attempt = 0; ; attempt++) {
    try {
      const [status, plans] = await Promise.all([
        getBridgeAuth().getSubscriptionStatus(),
        getBridgeAuth().getPlans(),
      ]);
      if (generation !== _subGeneration) return;
      // An empty list is more often a read that raced a change than an app
      // with no plans: ask once more before believing it.
      if ((plans?.length ?? 0) === 0 && attempt === 0) {
        await wait(_retryDelayMs);
        if (generation !== _subGeneration) return;
        continue;
      }
      _subscriptionWritable.set({ status, plans, loading: false, error: null });
      _subLoadedAt = Date.now();
      return;
    } catch (err) {
      if (generation !== _subGeneration) return;
      if (attempt === 0) {
        await wait(_retryDelayMs);
        if (generation !== _subGeneration) return;
        continue;
      }
      const msg = err instanceof Error ? err.message : 'Failed to load subscription';
      logger.warn('[bridge-instance] subscription read failed:', msg);
      const latest = get(_subscriptionWritable);
      if (latest.status !== null || latest.plans !== null) {
        // Keep the last good answer on screen; the next trigger re-reads.
        _subscriptionWritable.update((s) => ({ ...s, loading: false }));
      } else {
        _subscriptionWritable.update((s) => ({ ...s, loading: false, error: msg }));
      }
      return;
    }
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Test-only: forget every read and answer. */
export function __resetSubscriptionForTests(): void {
  resetSubscription();
  _subInflight = null;
  _subAgain = false;
  _subWanted = false;
}

// ── Convenience singleton accessor ────────────────────────────────────────────

/** Lazy proxy to the BridgeAuth singleton — call methods directly: `auth.getToken()`, `auth.logout()`, etc. */
export const auth: BridgeAuth = new Proxy({} as BridgeAuth, {
  get(_, prop) {
    const instance = getBridgeAuth();
    const value = Reflect.get(instance, prop);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

// ── Internal-only store writers (for use by wrapper modules) ───────────────────

export const _profileWritable = _profile;
export const _errorWritable = _error;
