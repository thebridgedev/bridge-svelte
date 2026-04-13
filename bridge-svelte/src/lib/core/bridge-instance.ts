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
const _flags: Writable<Record<string, boolean>> = writable({});
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
    _instance.getProfile().then((p) => _profile.set(p ?? null)).catch(() => {});
  }
  _authState.set(_instance.getAuthState());
  _isLoading.set(false);

  // Wire auth-core events → Svelte stores
  _instance.on('auth:login', (tokens) => {
    _tokens.set(tokens);
    _instance!.getProfile().then((p) => _profile.set(p ?? null)).catch(() => {});
  });

  _instance.on('auth:logout', () => {
    _tokens.set(null);
    _profile.set(null);
    _flags.set({});
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
    _flags.set({});
    _subscriptionWritable.set({ status: null, plans: null, loading: false, error: null });
    _instance!.getProfile().then((p) => _profile.set(p ?? null)).catch(() => {});
  });

  _instance.on('auth:error', (err) => {
    _error.set(err.message);
  });

  // Load app config anonymously (drives SSO buttons, signup toggle, etc.).
  // Cached in `_appConfigPromise` so LoginForm (and others) can await the
  // result via `ensureAppConfig()` instead of racing the store update.
  void ensureAppConfig();

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

/** Feature flags map */
export const flagsStore: Readable<Record<string, boolean>> = _flags;

/** Bridge ready state */
export const bridgeReadyStore: Readable<boolean> = _ready;

/** App-level config (SSO providers, feature flags, etc.) — loaded anonymously on init */
export const appConfigStore: Readable<AppConfig | null> = _appConfig;

// ── Subscription store ─────────────────────────────────────────────────────

interface SubscriptionState {
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

export async function loadSubscription(): Promise<void> {
  _subscriptionWritable.update((s) => ({ ...s, loading: true, error: null }));
  try {
    const [status, plans] = await Promise.all([
      getBridgeAuth().getSubscriptionStatus(),
      getBridgeAuth().getPlans(),
    ]);
    _subscriptionWritable.set({ status, plans, loading: false, error: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to load subscription';
    _subscriptionWritable.update((s) => ({ ...s, loading: false, error: msg }));
  }
}

// ── Convenience singleton accessor ────────────────────────────────────────────

/** Lazy proxy to the BridgeAuth singleton — call methods directly: `auth.getToken()`, `auth.logout()`, etc. */
export const auth: BridgeAuth = new Proxy({} as BridgeAuth, {
  get(_, prop) {
    const instance = getBridgeAuth();
    const value = (instance as any)[prop];
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});

// ── Internal-only store writers (for use by wrapper modules) ───────────────────

export const _flagsWritable = _flags;
export const _profileWritable = _profile;
export const _errorWritable = _error;
