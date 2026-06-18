// bridge-svelte/flags — bootstrap (TBP-200, hoisted in TBP-Live-Channel-Unification)
//
// Auth-free entry point for Feature Flags 2.0. After the runtime hoist, this
// module is ONLY about flag-specific wiring: the BridgeFlags eval cache,
// attribute providers, the telemetry batcher, hydrate, Svelte reactivity, and
// the auth-token subscription that drives flag eval context. The realtime
// client, billing-store binding, session.snapshot fanout, billing-family
// event dispatch, and token-driven channel scoping all live in
// `core/bridge-runtime.ts` and are mounted by `<BridgeBootstrap />`.
//
// Consumers don't call this directly anymore — `<BridgeBootstrap />` does it
// for them when `@nebulr-group/bridge-svelte/flags` is on the dependency
// graph. `createBridgeFlags(...)` stays exported as an advanced API for tests
// + standalone-SDK use, but its `apiBaseUrl` / `apiKey` args are now optional
// and default to the values stored by `bridgeConfig.initConfig({...})`.

import {
  BridgeFlags,
  type BridgeFlagsMode,
  type BridgeFlagsHooks,
  attachIdentity,
  type BridgeIdentity,
  type IdentityStorage,
  type AnonymousTrackingMode,
  MemoryIdentityStorage,
  TelemetryBatcher,
  type TelemetryBatcherConfig,
  AuthAttributeProvider,
  type AuthJwtClaims,
  BillingAttributeProvider,
  useBridge,
} from '@nebulr-group/bridge-auth-core';

import { setBridgeFlagsInstance, notifyFlagChanged, notifyAllFlagsChanged } from './registry.js';
import { tokenStore, getBridgeAuth } from '../core/bridge-instance.js';
import { _getDevAttributeProvider } from '../core/bridge.js';
import {
  getBridgeRealtime,
  onBridgeRealtimeOpen,
} from '../core/bridge-runtime.js';
import { getConfig } from '../client/stores/config.store.js';

/** A storage implementation that uses `localStorage` (persistent) or `sessionStorage` (per-tab). */
export class BrowserIdentityStorage implements IdentityStorage {
  readonly mode: AnonymousTrackingMode;
  private readonly storage: Storage;
  private readonly key: string;

  constructor(mode: 'persistent' | 'session', key = 'bridge.anon_id') {
    this.mode = mode;
    this.key = key;
    if (typeof window === 'undefined') {
      throw new Error('BrowserIdentityStorage requires a window — use MemoryIdentityStorage on the server');
    }
    this.storage = mode === 'persistent' ? window.localStorage : window.sessionStorage;
  }

  read(): string | undefined {
    try {
      return this.storage.getItem(this.key) ?? undefined;
    } catch {
      return undefined;
    }
  }

  write(id: string): void {
    try {
      this.storage.setItem(this.key, id);
    } catch {
      // Quota / privacy mode — silently degrade.
    }
  }

  clear(): void {
    try {
      this.storage.removeItem(this.key);
    } catch {
      // ignore
    }
  }
}

export interface CreateBridgeFlagsConfig {
  /**
   * Bridge API base URL. Optional — defaults to the value stored by
   * `bridgeConfig.initConfig({...})` (which itself defaults to
   * `https://api.thebridge.dev`). Bridge developers override this for
   * local / stage envs; product consumers never set it.
   */
  apiBaseUrl?: string;
  /**
   * JWT-shaped workspace API key — sent as `x-api-key`. Optional — defaults
   * to `appId` from `bridgeConfig.initConfig({...})`. The two values are the
   * same thing (the workspace identity) under different names; the auth
   * config call is the single source of truth.
   */
  apiKey?: string;
  /** Frontend (default) or backend. Use 'backend' in SSR-load() functions. */
  mode?: BridgeFlagsMode;
  /** Anonymous identity options. Persistent (localStorage) by default in browsers. */
  identity?: {
    /** 'persistent' (localStorage), 'session' (sessionStorage), 'none' (memory only). Default 'persistent'. */
    tracking?: AnonymousTrackingMode;
    /** Override storage entirely (e.g. cookie-backed). */
    storage?: IdentityStorage;
    /** localStorage key when using the default browser storage. Default 'bridge.anon_id'. */
    storageKey?: string;
  };
  /** Telemetry opts — set `enabled: false` to skip. */
  telemetry?: Partial<Omit<TelemetryBatcherConfig, 'apiBaseUrl' | 'apiKey'>>;
  /**
   * If false, this bootstrap won't register itself as the global Svelte
   * instance used by `useFlag` / `<FeatureFlag>`. Useful when multiple
   * BridgeFlags are needed in the same app. Defaults to true.
   */
  registerGlobal?: boolean;
  /**
   * Optional extra hooks the consumer wants chained on top of the
   * built-in (telemetry + reactivity) hooks. Errors in user hooks are
   * caught — they will never break flag eval.
   */
  hooks?: BridgeFlagsHooks;
}

export interface BridgeFlagsBundle {
  bridge: BridgeFlags;
  identity: BridgeIdentity;
  telemetry: TelemetryBatcher;
  authAttributeProvider: AuthAttributeProvider;
  billingAttributeProvider: BillingAttributeProvider;
  /** Stop telemetry + unsubscribe from auth events. Idempotent. */
  stop: () => Promise<void>;
}

function pickIdentityStorage(
  cfg: CreateBridgeFlagsConfig['identity'],
): IdentityStorage {
  if (cfg?.storage) return cfg.storage;
  const tracking = cfg?.tracking ?? 'persistent';
  if (tracking === 'none') return new MemoryIdentityStorage('none');
  // SSR path — no `window`. Fall back to memory; the browser-side bootstrap
  // (re-running with `window` present) will install the real storage.
  if (typeof globalThis === 'undefined' || !(globalThis as any).window) {
    return new MemoryIdentityStorage(tracking);
  }
  return new BrowserIdentityStorage(tracking === 'session' ? 'session' : 'persistent', cfg?.storageKey);
}

/** Decode a JWT payload without signature verification (client-side context only). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Build a fully wired BridgeFlags bundle. Bootstraps the flag-specific
 * runtime ON TOP OF the core Bridge runtime — meaning `startBridgeRuntime()`
 * must already have run (typically from `<BridgeBootstrap />`). The shared
 * RealtimeClient is read via `getBridgeRealtime()` and re-used; no second
 * websocket is opened.
 *
 * The returned instance is also registered as the global instance used by
 * `useFlag` and `<FeatureFlag>` unless `registerGlobal` is explicitly false.
 */
export function createBridgeFlags(config: CreateBridgeFlagsConfig = {}): BridgeFlagsBundle {
  // Resolve config from the auth config store when the consumer doesn't pass
  // explicit values. `bridgeConfig.initConfig({...})` is the single source of
  // truth — consumers never plumb apiBaseUrl / apiKey through twice.
  let resolvedApiBaseUrl = config.apiBaseUrl;
  let resolvedApiKey = config.apiKey;
  try {
    const stored = getConfig();
    resolvedApiBaseUrl ??= stored.apiBaseUrl ?? 'https://api.thebridge.dev';
    resolvedApiKey ??= stored.appId;
  } catch {
    // No initConfig call — only OK when the caller passed everything.
  }
  if (!resolvedApiBaseUrl) resolvedApiBaseUrl = 'https://api.thebridge.dev';
  if (!resolvedApiKey) {
    throw new Error(
      'createBridgeFlags: apiKey/appId could not be resolved. Call bridgeConfig.initConfig({ appId }) first or pass apiKey explicitly.',
    );
  }

  const bridge = new BridgeFlags({ mode: config.mode });

  // Billing 2.0 US-11 — self-report `bridge.flag_evaluations` to the usage
  // pipeline. Best-effort: in SSR test harnesses without BridgeAuth, skip.
  try {
    const auth = getBridgeAuth();
    bridge.setUsageReporter(auth.usage);
  } catch {
    // No BridgeAuth instance yet — flags can still operate without usage reporting.
  }

  // US-11 — wire the QuotaStore HTTP options so `useBridge().quota(metric)`
  // can hydrate on first access. Core's tokenStore subscription refreshes the
  // accessToken on login/logout/refresh; here we snapshot the initial value.
  try {
    const auth = getBridgeAuth();
    useBridge().quotas.configure({
      apiBaseUrl: resolvedApiBaseUrl,
      appId: auth.getApiContext().appId,
      accessToken: auth.getApiContext().accessToken,
    });
  } catch {
    // No BridgeAuth — quota hydration falls back to live pushes only.
  }

  const identity = attachIdentity(bridge, pickIdentityStorage(config.identity));

  // Phase 1 / US-13 (TBP-295) — current decoded JWT claims. The
  // AuthAttributeProvider's `getClaims()` returns this on every flag eval so
  // `user.role`, `user.email`, `tenant.id`, `tenant.plan`, `privileges` flow
  // through the registry instead of via direct `bridge.setContext()` calls.
  let _currentClaims: AuthJwtClaims | undefined;

  // Patch upsert/remove on the bridge so realtime mutations re-notify the
  // Svelte reactivity layer. We use prototype-style monkey-patching on the
  // instance so we don't touch auth-core itself. This is intentionally a
  // narrow seam — the public API surface (upsert / remove / hydrate) is
  // explicitly the cache write path.
  const originalUpsert = bridge.upsert.bind(bridge);
  bridge.upsert = (flag) => {
    originalUpsert(flag);
    notifyFlagChanged(flag.key, _BUMP_SENTINEL);
  };
  const originalRemove = bridge.remove.bind(bridge);
  bridge.remove = (key) => {
    originalRemove(key);
    notifyFlagChanged(key, _BUMP_SENTINEL);
  };
  const originalHydrate = bridge.hydrate.bind(bridge);
  bridge.hydrate = (flags) => {
    originalHydrate(flags);
    notifyAllFlagsChanged();
  };

  // Attach the flag cache to the SHARED RealtimeClient owned by core. Calling
  // attach() on a started client is safe — the realtime client tolerates
  // post-start cache binding (it just registers an upsert/remove dispatcher).
  // If core hasn't started yet (e.g. standalone-SDK harness), skip the attach
  // — the consumer can wire it manually on `getBridgeRealtime()` once started.
  const realtime = getBridgeRealtime();
  if (realtime) {
    realtime.attach(bridge);
  }

  // Phase 1 / US-13 (TBP-296) — bridge-managed AttributeProviders. Both are
  // auto-registered below; consumers never wire these by hand.
  const billingAttributeProvider = new BillingAttributeProvider();
  billingAttributeProvider.bindStores({
    subscription: useBridge().subscription,
    quotas: useBridge().quotas,
    entitlements: useBridge().entitlementsStore,
  });
  const authAttributeProvider = new AuthAttributeProvider({
    getClaims: () => _currentClaims,
  });
  bridge.registerAttributeProvider(authAttributeProvider);
  bridge.registerAttributeProvider(billingAttributeProvider);
  // Phase 5 (TBP-328) — register the dev-managed provider LAST so its
  // set/bind/bindMany keys win on collision with framework providers.
  bridge.registerAttributeProvider(_getDevAttributeProvider());

  const telemetry = new TelemetryBatcher({
    apiBaseUrl: resolvedApiBaseUrl,
    apiKey: resolvedApiKey,
    ...config.telemetry,
  });

  // Compose hooks: telemetry (baseline) + reactivity (eval-driven bumps) +
  // user-supplied.
  attachWithCompositeHooks(bridge, telemetry, config.hooks ?? {});

  // Hydrate the flag cache so the first `bridge.flag()` call returns the right
  // value instead of the developer-supplied default. Best-effort.
  const hydrateFlagsCache = async (): Promise<void> => {
    try {
      const res = await fetch(
        `${resolvedApiBaseUrl!.replace(/\/+$/, '')}/admin/flags-internal/flags-cache/${encodeURIComponent(resolvedApiKey!)}`,
      );
      if (!res.ok) return;
      const flags = (await res.json()) as unknown;
      if (Array.isArray(flags) && flags.length > 0) {
        bridge.hydrate(flags as Parameters<typeof bridge.hydrate>[0]);
      }
    } catch {
      // Hydration is best-effort.
    }
  };

  // Re-hydrate every time the shared realtime client (re)opens. Covers
  // initial-hydrate-failed and flag-mutations-during-offline gaps.
  const unsubscribeOpen = onBridgeRealtimeOpen(() => {
    void hydrateFlagsCache();
  });

  // Initial hydrate fires here too — covers the case where realtime is
  // disabled and onOpen never fires.
  void hydrateFlagsCache();

  if (config.registerGlobal !== false) {
    setBridgeFlagsInstance(bridge);
  }

  // Flag-context concerns on token change: setContext identity + claims +
  // re-eval. Core handles channel scoping + quotas + reauthorize separately;
  // two subscribers is fine (idempotent and cheap).
  const unsubscribeAuth = tokenStore.subscribe((tokens) => {
    if (!tokens?.accessToken) {
      _currentClaims = undefined;
      bridge.setContext({ identity: undefined, attributes: {} });
      notifyAllFlagsChanged();
      return;
    }
    const claims = decodeJwtPayload(tokens.accessToken);
    if (!claims) return;
    _currentClaims = claims as AuthJwtClaims;
    bridge.setContext({
      identity: typeof claims.sub === 'string' ? claims.sub : undefined,
      attributes: {},
    });
    notifyAllFlagsChanged();
  });

  const stop = async (): Promise<void> => {
    unsubscribeAuth();
    unsubscribeOpen();
    await telemetry.stop();
  };

  return {
    bridge,
    identity,
    telemetry,
    authAttributeProvider,
    billingAttributeProvider,
    stop,
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────

const _BUMP_SENTINEL = Symbol('bridge.flags.bump');

/**
 * Telemetry's `attach` calls `bridge.setHooks` and overwrites whatever was
 * there. We capture the batcher's onEval/onDiscover/onAttributeDeclaration
 * by snooping via a one-shot setHooks override, then re-install a composite
 * that calls them + our reactivity bump + the user's hooks.
 */
function attachWithCompositeHooks(
  bridge: BridgeFlags,
  telemetry: TelemetryBatcher,
  userHooks: BridgeFlagsHooks,
): void {
  let captured: BridgeFlagsHooks = {};
  const originalSetHooks = bridge.setHooks.bind(bridge);
  bridge.setHooks = (hooks: BridgeFlagsHooks): void => {
    captured = hooks ?? {};
  };
  try {
    telemetry.attach(bridge);
  } finally {
    bridge.setHooks = originalSetHooks;
  }
  bridge.setHooks({
    onEval: (ev) => {
      try { captured.onEval?.(ev); } catch { /* telemetry hook errors swallowed */ }
      try { userHooks.onEval?.(ev); } catch { /* user hook errors swallowed */ }
      notifyFlagChanged(ev.flag, ev.value);
    },
    onDiscover: (ev) => {
      try { captured.onDiscover?.(ev); } catch { /* ignore */ }
      try { userHooks.onDiscover?.(ev); } catch { /* ignore */ }
    },
    onAttributeDeclaration: (decl) => {
      try { captured.onAttributeDeclaration?.(decl); } catch { /* ignore */ }
      try { userHooks.onAttributeDeclaration?.(decl); } catch { /* ignore */ }
    },
    onAttributeObserved: (obs) => {
      try { captured.onAttributeObserved?.(obs); } catch { /* ignore */ }
      try { userHooks.onAttributeObserved?.(obs); } catch { /* ignore */ }
    },
  });
}
