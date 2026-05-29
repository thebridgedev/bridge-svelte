// bridge-svelte/flags — bootstrap auto-registration tests (TBP-300).
//
// Covers the Phase 1 / US-13 wiring committed in 26858b1:
//   - createBridgeFlags() returns both authAttributeProvider and
//     billingAttributeProvider on the bundle.
//   - The BridgeFlags instance has both providers auto-registered on its
//     AttributeProviderRegistry under the canonical names 'bridge:auth' /
//     'bridge:billing'.
//   - The tokenStore subscription is the only thing that feeds JWT claims
//     into the AuthAttributeProvider; on token emit, the provider returns
//     user.id / user.role / tenant.id; on logout (null token), the provider
//     returns {}.
//   - bridge.flag() doesn't blow up the eval when providers are present and
//     no flag is cached (the hot eval path goes through collectSync()).
//
// The full Bridge auth stack is intentionally NOT brought up — bridge-instance
// is mocked with a controllable writable tokenStore + stub BridgeAuth, and
// `useBridge()` is mocked at the auth-core boundary so the bootstrap can wire
// the BillingAttributeProvider without spinning up real billing stores.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { writable, type Writable } from 'svelte/store';

// ── Test fixtures: in-memory tokenStore + stub BridgeAuth ───────────────────

type TokenSet = { accessToken: string | null; refreshToken?: string | null } | null;
let _tokenStore: Writable<TokenSet>;

function makeJwt(claims: Record<string, unknown>): string {
  // Browser-compatible base64url (no padding). atob lives in Node 18+ and in the
  // bootstrap module's decodeJwtPayload path.
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const payload = btoa(JSON.stringify(claims))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${payload}.sig`;
}

// ── Mocks ───────────────────────────────────────────────────────────────────

// Mock the bridge-instance module so we don't bring up real BridgeAuth.
// `tokenStore` is a real svelte writable so we can push JWT-shaped values
// during the test; the rest is a safe stub.
vi.mock('../core/bridge-instance.js', () => {
  return {
    get tokenStore() {
      return _tokenStore;
    },
    getBridgeAuth: () => ({
      getApiContext: () => ({ appId: 'app-1', accessToken: null }),
      refreshTokens: async () => {},
      usage: { report: () => {} },
    }),
  };
});

// Mock auth-core's useBridge() so BillingAttributeProvider.bindStores() gets
// the three expected store shapes without bringing up the real billing stack.
// We keep all OTHER auth-core exports real (BridgeFlags, the AttributeProvider
// classes, etc.) — only useBridge() is replaced.
vi.mock('@nebulr-group/bridge-auth-core', async (importOriginal) => {
  const real = await importOriginal<typeof import('@nebulr-group/bridge-auth-core')>();
  return {
    ...real,
    useBridge: () => ({
      subscription: {
        snapshot: () => ({ state: undefined, loading: false, error: null }),
        attach: () => {},
      },
      quotas: {
        getAll: () => new Map(),
        configure: () => {},
      },
      entitlementsStore: {
        all: () => ({}),
        isHydrated: () => false,
      },
      attachToRealtimeClient: () => {},
      // Phase 5 (TBP-331) — bootstrap registers an event-forwarding handler.
      // Mock the handle() multi-subscriber API with a no-op that returns an
      // unsubscribe so the wiring path doesn't throw.
      handle: () => () => {},
    }),
  };
});

// Best-effort: stub global fetch so the optional hydrateFlagsCache() in
// bootstrap (which fires `void fetch(...)`) doesn't write to a real network.
// Bootstrap swallows the resulting non-ok response, so a 500 is fine.
beforeEach(() => {
  _tokenStore = writable<TokenSet>(null);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ ok: false, status: 500, json: async () => [] }) as any,
    ),
  );
});

// ── Imports under test ──────────────────────────────────────────────────────
// Imported AFTER the mocks above so the bootstrap module picks up the stubs.

import { createBridgeFlags } from './bootstrap.js';
import { AuthAttributeProvider, BillingAttributeProvider } from '@nebulr-group/bridge-auth-core';

// After the TBP-Live-Channel-Unification hoist, the realtime client lives
// in `core/bridge-runtime.ts` and is owned by `<BridgeBootstrap />`. Tests
// don't start the core runtime so `getBridgeRealtime()` returns undefined
// and flag bootstrap skips the realtime.attach step — exactly the behavior
// we want in unit tests. The `realtime: { enabled: false }` config option
// is gone because realtime opts now belong to the runtime layer, not flags.
function bootstrap() {
  return createBridgeFlags({
    apiBaseUrl: 'http://test',
    apiKey: 'k',
    telemetry: { enabled: false },
    registerGlobal: false,
  });
}

describe('createBridgeFlags — Phase 1 / US-13 auto-registration', () => {
  it('returns both auth + billing attribute providers on the bundle', async () => {
    const bundle = bootstrap();
    try {
      expect(bundle.authAttributeProvider).toBeInstanceOf(AuthAttributeProvider);
      expect(bundle.billingAttributeProvider).toBeInstanceOf(BillingAttributeProvider);
    } finally {
      await bundle.stop();
    }
  });

  it('auto-registers both framework providers AND the dev provider on the BridgeFlags registry', async () => {
    const bundle = bootstrap();
    try {
      const names = bundle.bridge.getAttributeProviderRegistry().names();
      expect(names).toContain('bridge:auth');
      expect(names).toContain('bridge:billing');
      // Phase 5 (TBP-328) — DevAttributeProvider auto-registered last so its
      // keys win on collision with framework providers.
      expect(names).toContain('dev');
      expect(bundle.bridge.getAttributeProviderRegistry().size()).toBe(3);
    } finally {
      await bundle.stop();
    }
  });

  it('tokenStore emit propagates JWT claims through AuthAttributeProvider', async () => {
    const bundle = bootstrap();
    try {
      // Push a token with claims into the mocked tokenStore. Bootstrap's
      // subscribe handler decodes the JWT and stores claims in _currentClaims,
      // which AuthAttributeProvider reads via its getClaims() callback.
      _tokenStore.set({
        accessToken: makeJwt({ sub: 'user-42', role: 'OWNER', tid: 'tenant-7' }),
      });

      const attrs = bundle.authAttributeProvider.provide();
      expect(attrs['user.id']).toBe('user-42');
      expect(attrs['user.role']).toBe('OWNER');
      expect(attrs['tenant.id']).toBe('tenant-7');

      // Identity flows onto the BridgeFlags eval context (set by bootstrap's
      // tokenStore subscribe), even though the JWT-derived attributes do NOT
      // (per Phase 1: those flow via the provider, not via setContext).
      expect(bundle.bridge.getContext().identity).toBe('user-42');
    } finally {
      await bundle.stop();
    }
  });

  it('logout (null token) drops every JWT-derived attribute from the provider', async () => {
    const bundle = bootstrap();
    try {
      // Login first to populate claims.
      _tokenStore.set({
        accessToken: makeJwt({ sub: 'user-42', role: 'OWNER', tid: 'tenant-7' }),
      });
      expect(bundle.authAttributeProvider.provide()).toMatchObject({
        'user.id': 'user-42',
      });

      // Then logout — bootstrap's subscribe handler clears _currentClaims, so
      // the provider's getClaims() returns undefined, so provide() returns {}.
      _tokenStore.set(null);
      expect(bundle.authAttributeProvider.provide()).toEqual({});
      // And identity is cleared from the eval context.
      expect(bundle.bridge.getContext().identity).toBeUndefined();
    } finally {
      await bundle.stop();
    }
  });

  it('bridge.flag() does not throw after bootstrap (registry hot path stays safe)', async () => {
    const bundle = bootstrap();
    try {
      // No cached flag, providers registered — exercises collectSync() merge
      // on the eval path. Should return the dev default cleanly.
      expect(() => bundle.bridge.flag('any', 'x')).not.toThrow();
      expect(bundle.bridge.flag('any', 'x')).toEqual({ passed: false, value: 'x' });

      // Same after a token is loaded (claims now flow through the provider).
      _tokenStore.set({
        accessToken: makeJwt({ sub: 'user-99', role: 'ADMIN' }),
      });
      expect(() => bundle.bridge.flag('any', 'x')).not.toThrow();
      expect(bundle.bridge.flag('any', 'x')).toEqual({ passed: false, value: 'x' });
    } finally {
      await bundle.stop();
    }
  });
});
