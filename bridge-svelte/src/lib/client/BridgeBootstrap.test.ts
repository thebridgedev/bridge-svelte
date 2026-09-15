// TBP-653 — bridgeBootstrap() must evaluate the route guard on EVERY call.
//
// SvelteKit re-runs the root layout load for every navigation, including the
// one a child `load` redirects into during the very first navigation of a page
// load — before <BridgeBootstrap>'s beforeNavigate guard has mounted. The old
// implementation returned early on every call after the first completed one,
// so that redirect target was checked by nobody and a signed-out visitor got
// the protected page.
//
// BridgeAuth and its route guard are faked here (they are auth-core's and
// tested there); what is under test is bridge-svelte's orchestration: when the
// guard runs, what runs once, and what happens when the guard cannot decide.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

type Rule = { match: string | RegExp; public?: boolean; featureFlag?: string; redirectTo?: string };
type GuardConfig = { rules: Rule[]; defaultAccess?: 'public' | 'protected'; returnTo?: { loginRoute?: string } };

const h = vi.hoisted(() => {
  const s = {
    authenticated: false,
    guardThrows: false,
    flagImpl: (_key: string): Promise<boolean> => Promise.resolve(true),
    loadFlagsImpl: (): Promise<Record<string, boolean>> => Promise.resolve({}),
    refreshImpl: (): Promise<unknown> => Promise.resolve(null),
    paywall: false,
    calls: {
      refresh: 0,
      loadFlags: 0,
      mount: 0,
      initBridge: 0,
      installFetch: 0,
      invalidate: 0,
      stash: [] as Array<string | null | undefined>,
    },
  };

  const toRe = (p: string | RegExp) =>
    p instanceof RegExp ? p : new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*')}$`);

  function createRouteGuard(cfg: GuardConfig) {
    const find = (path: string) => cfg.rules.find((r) => toRe(r.match).test(path)) ?? null;
    const isPublicRoute = (path: string) => {
      const rule = find(path);
      return rule ? !!rule.public : (cfg.defaultAccess ?? 'protected') === 'public';
    };
    return {
      isPublicRoute,
      isProtectedRoute: (p: string) => !isPublicRoute(p),
      shouldRedirectToLogin: (p: string) => {
        if (s.guardThrows) throw new Error('route config is broken');
        return !isPublicRoute(p) && !s.authenticated;
      },
      async checkRouteRestrictions(p: string) {
        const rule = find(p);
        if (rule?.featureFlag && !(await s.flagImpl(rule.featureFlag))) return rule.redirectTo ?? '/';
        return null;
      },
      getLoginRedirect: () => 'https://hosted.example/login',
      resolveReturnTo: (attempted: string) => {
        const path = attempted.split('?')[0];
        if (path === cfg.returnTo?.loginRoute || isPublicRoute(path)) return null;
        return attempted;
      },
      async getNavigationDecision() {
        throw new Error('bridge-svelte must use its own wrapper, not call through');
      },
    };
  }

  const auth = {
    isAuthenticated: () => s.authenticated,
    getTokens: () => (s.authenticated ? { accessToken: 'at' } : null),
    refreshTokens: () => {
      s.calls.refresh += 1;
      return s.refreshImpl();
    },
    getApiContext: () => ({ apiBaseUrl: 'http://api', appId: 'app-1', accessToken: s.authenticated ? 'at' : null }),
    loadFeatureFlags: () => {
      s.calls.loadFlags += 1;
      return s.loadFlagsImpl();
    },
    invalidateFeatureFlagCache: () => {
      s.calls.invalidate += 1;
    },
    shouldRedirectToPaywall: async () => s.paywall,
    createLoginUrl: () => 'https://hosted.example/login',
    createRouteGuard,
    confirmStripeCheckout: () => Promise.resolve(),
  };

  return { s, auth, ready: undefined as undefined | { set(v: boolean): void } };
});

vi.mock('../core/bridge-instance.js', async () => {
  const { writable } = await import('svelte/store');
  const ready = writable(false);
  // The mock outlives vi.resetModules(); keep a handle so each test can start
  // from a fresh (not-yet-ready) page load.
  h.ready = ready;
  return {
    bridgeReadyStore: ready,
    markReady: () => ready.set(true),
    waitForBridge: () => Promise.resolve(),
    initBridge: () => {
      h.s.calls.initBridge += 1;
    },
    getBridgeAuth: () => h.auth,
  };
});

vi.mock('../core/bridge-runtime.js', () => ({
  installBridgeAuthFetch: () => {
    h.s.calls.installFetch += 1;
  },
}));

vi.mock('@nebulr-group/bridge-auth-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nebulr-group/bridge-auth-core')>();
  return {
    ...actual,
    useBridge: () => ({
      subscription: {
        mount: async () => {
          h.s.calls.mount += 1;
        },
      },
    }),
    stashReturnTo: (v: string | null | undefined) => {
      h.s.calls.stash.push(v);
    },
    takeReturnTo: () => null,
  };
});

const SDK_CONFIG = {
  appId: 'app-1',
  loginRoute: '/auth/login',
  callbackUrl: 'http://localhost/auth/oauth-callback',
};
const HOSTED_CONFIG = { appId: 'app-1', callbackUrl: 'http://localhost/auth/oauth-callback' };
const ROUTES: GuardConfig = {
  rules: [
    { match: new RegExp('^/auth($|/)'), public: true },
    { match: '/', public: true },
    { match: '/pro', featureFlag: 'pro-page', redirectTo: '/' },
  ],
  defaultAccess: 'protected',
};

const at = (path: string) => new URL(path, 'http://localhost');

async function load() {
  return import('./BridgeBootstrap.js');
}

async function redirectOf(p: Promise<unknown>): Promise<{ status: number; location: string }> {
  try {
    await p;
  } catch (err) {
    if (isRedirect(err)) return { status: err.status, location: err.location };
    throw err;
  }
  throw new Error('expected a redirect, but the call resolved');
}

async function expectLogin(p: Promise<unknown>, returnTo: string | null) {
  const { location } = await redirectOf(p);
  const target = new URL(location, 'http://localhost');
  expect(target.pathname).toBe('/auth/login');
  expect(target.searchParams.get('redirectUri')).toBe(returnTo);
}

beforeEach(() => {
  vi.resetModules();
  h.ready?.set(false);
  h.s.authenticated = false;
  h.s.guardThrows = false;
  h.s.flagImpl = () => Promise.resolve(true);
  h.s.loadFlagsImpl = () => Promise.resolve({});
  h.s.refreshImpl = () => Promise.resolve(null);
  h.s.paywall = false;
  h.s.calls = { refresh: 0, loadFlags: 0, mount: 0, initBridge: 0, installFetch: 0, invalidate: 0, stash: [] };
});

describe('bridgeBootstrap guards every call (TBP-653)', () => {
  it('a public entry, then a protected redirect target in the same page load → login', async () => {
    const { bridgeBootstrap } = await load();
    await bridgeBootstrap(at('/'), SDK_CONFIG, ROUTES);
    // The consumer's `/+page.ts` redirects to /admin-main; SvelteKit re-runs
    // the root layout load for the new URL.
    await expectLogin(bridgeBootstrap(at('/admin-main'), SDK_CONFIG, ROUTES), '/admin-main');
  });

  it('keeps the attempted path AND query on a re-guarded call (TBP-629)', async () => {
    const { bridgeBootstrap } = await load();
    await bridgeBootstrap(at('/'), SDK_CONFIG, ROUTES);
    await expectLogin(
      bridgeBootstrap(at('/incident/42?key=abc&iv=1'), SDK_CONFIG, ROUTES),
      '/incident/42?key=abc&iv=1',
    );
  });

  it('hosted mode re-guards too: redirects to the hosted login and stashes the target', async () => {
    const { bridgeBootstrap } = await load();
    await bridgeBootstrap(at('/'), HOSTED_CONFIG, ROUTES);
    const { location } = await redirectOf(bridgeBootstrap(at('/deep?x=1'), HOSTED_CONFIG, ROUTES));
    expect(location).toBe('https://hosted.example/login');
    expect(h.s.calls.stash).toEqual(['/deep?x=1']);
  });

  it('a signed-out session is re-evaluated instead of inheriting the signed-in verdict', async () => {
    const { bridgeBootstrap } = await load();
    h.s.authenticated = true;
    await bridgeBootstrap(at('/admin'), SDK_CONFIG, ROUTES);
    h.s.authenticated = false; // logout
    await expectLogin(bridgeBootstrap(at('/admin'), SDK_CONFIG, ROUTES), '/admin');
  });

  it('still lets a signed-in user through on later calls', async () => {
    const { bridgeBootstrap } = await load();
    h.s.authenticated = true;
    await bridgeBootstrap(at('/'), SDK_CONFIG, ROUTES);
    await expect(bridgeBootstrap(at('/admin'), SDK_CONFIG, ROUTES)).resolves.toBeDefined();
  });
});

describe('initialisation stays once per page load (TBP-653)', () => {
  it('config, fetch patch, token refresh, billing mount and flag warm-up run once across calls', async () => {
    const { bridgeBootstrap } = await load();
    h.s.authenticated = true;
    await bridgeBootstrap(at('/'), SDK_CONFIG, ROUTES);
    await bridgeBootstrap(at('/admin'), SDK_CONFIG, ROUTES);
    await bridgeBootstrap(at('/settings?tab=2'), SDK_CONFIG, ROUTES);
    expect(h.s.calls).toMatchObject({ initBridge: 1, installFetch: 1, refresh: 1, mount: 1, loadFlags: 1 });
  });

  it('a redirect that lands while the first call is still in flight shares the init and is guarded', async () => {
    const { bridgeBootstrap } = await load();
    h.s.authenticated = true;
    h.s.flagImpl = async (key) => key !== 'pro-page'; // Free plan
    let releaseRefresh!: () => void;
    h.s.refreshImpl = () => new Promise<void>((resolve) => { releaseRefresh = resolve; });

    const entry = bridgeBootstrap(at('/'), SDK_CONFIG, ROUTES);
    const target = redirectOf(bridgeBootstrap(at('/pro'), SDK_CONFIG, ROUTES));
    await Promise.resolve();
    releaseRefresh();

    await expect(entry).resolves.toBeDefined();
    expect((await target).location).toBe('/');
    expect(h.s.calls.refresh).toBe(1);
    expect(h.s.calls.loadFlags).toBe(1);
  });

  it('a flag load that lands after an invalidation is discarded (TBP-654)', async () => {
    const { bridgeBootstrap } = await load();
    const { invalidateRouteGuardCache } = await import('../auth/guard-cache.js');
    let landFlags!: () => void;
    h.s.loadFlagsImpl = () => new Promise((resolve) => { landFlags = () => resolve({}); });

    const call = bridgeBootstrap(at('/'), SDK_CONFIG, ROUTES);
    await vi.waitFor(() => expect(h.s.calls.loadFlags).toBe(1));
    invalidateRouteGuardCache(); // e.g. the user signs in while the warm-up is in flight
    expect(h.s.calls.invalidate).toBe(1);
    landFlags();
    const result = await call;
    await result.flagsReady;
    expect(h.s.calls.invalidate).toBe(2);
  });
});

// TBP-654 (upgrade race) — the page shows the new plan before the token that
// carries it lands. A load-level decision taken in that window must wait for
// the refresh (bounded) instead of judging the user on the old token.
describe('load-level decisions wait for the refreshed token after a plan change (TBP-654)', () => {
  async function upgradeInFlight() {
    const { trackAuthorizationChange } = await import('../auth/guard-cache.js');
    let plan = 'free';
    h.s.flagImpl = async (key) => key !== 'pro-page' || plan === 'pro';
    let land!: () => void;
    trackAuthorizationChange(new Promise<void>((resolve) => { land = () => { plan = 'pro'; resolve(); }; }));
    return () => land();
  }

  it('bridgeBootstrap: /pro during the refresh window is allowed with the new token', async () => {
    const { bridgeBootstrap } = await load();
    h.s.authenticated = true;
    await bridgeBootstrap(at('/'), SDK_CONFIG, ROUTES);
    const land = await upgradeInFlight();
    const nav = bridgeBootstrap(at('/pro'), SDK_CONFIG, ROUTES);
    setTimeout(land, 20);
    await expect(nav).resolves.toBeDefined();
  });

  it('assertAuthorized: waits the same way', async () => {
    const { bridgeBootstrap, assertAuthorized } = await load();
    h.s.authenticated = true;
    await bridgeBootstrap(at('/'), SDK_CONFIG, ROUTES);
    const land = await upgradeInFlight();
    const check = assertAuthorized(at('/pro'));
    setTimeout(land, 20);
    await expect(check).resolves.toBeUndefined();
  });

  it('with nothing pending the old verdict stands: a Free user is still refused /pro', async () => {
    const { bridgeBootstrap } = await load();
    h.s.authenticated = true;
    h.s.flagImpl = async (key) => key !== 'pro-page';
    await bridgeBootstrap(at('/'), SDK_CONFIG, ROUTES);
    expect((await redirectOf(bridgeBootstrap(at('/pro'), SDK_CONFIG, ROUTES))).location).toBe('/');
  });
});

describe('the guard fails closed (TBP-653)', () => {
  it('a flag check that errors denies a signed-in user, via the rule redirectTo', async () => {
    const { bridgeBootstrap } = await load();
    h.s.authenticated = true;
    h.s.flagImpl = async () => { throw new Error('network down'); };
    await bridgeBootstrap(at('/'), SDK_CONFIG, ROUTES);
    expect((await redirectOf(bridgeBootstrap(at('/pro'), SDK_CONFIG, ROUTES))).location).toBe('/');
  });

  it('a guard that throws sends a signed-out visitor on a protected route to login', async () => {
    const { bridgeBootstrap } = await load();
    await bridgeBootstrap(at('/'), SDK_CONFIG, ROUTES);
    h.s.guardThrows = true;
    await expectLogin(bridgeBootstrap(at('/admin'), SDK_CONFIG, ROUTES), '/admin');
  });

  it('a public route without requirements stays reachable when the decision errors', async () => {
    const { bridgeBootstrap } = await load();
    await bridgeBootstrap(at('/'), SDK_CONFIG, ROUTES);
    h.s.guardThrows = true;
    await expect(bridgeBootstrap(at('/'), SDK_CONFIG, ROUTES)).resolves.toBeDefined();
  });
});

describe('the paywall still fires on the first load', () => {
  it('redirects to billing.paywallRoute before anything renders', async () => {
    const { bridgeBootstrap } = await load();
    h.s.authenticated = true;
    h.s.paywall = true;
    const config = { ...SDK_CONFIG, billing: { paywallRoute: '/welcome' } };
    expect((await redirectOf(bridgeBootstrap(at('/admin'), config, ROUTES))).location).toBe('/welcome');
  });
});

describe('assertAuthorized — consumer-callable second line of defence (TBP-653)', () => {
  it('throws the login redirect for a signed-out visitor on a protected route', async () => {
    const { bridgeBootstrap, assertAuthorized } = await load();
    await bridgeBootstrap(at('/'), SDK_CONFIG, ROUTES);
    await expectLogin(assertAuthorized(at('/admin?tab=billing')), '/admin?tab=billing');
  });

  it('resolves for a public route and for a signed-in user', async () => {
    const { bridgeBootstrap, assertAuthorized } = await load();
    await bridgeBootstrap(at('/'), SDK_CONFIG, ROUTES);
    await expect(assertAuthorized(at('/'))).resolves.toBeUndefined();
    h.s.authenticated = true;
    await expect(assertAuthorized(at('/admin'))).resolves.toBeUndefined();
  });

  it('waits for bridgeBootstrap when a child load runs first, then decides', async () => {
    const { bridgeBootstrap, assertAuthorized } = await load();
    const child = expectLogin(assertAuthorized(at('/admin')), '/admin');
    await bridgeBootstrap(at('/'), SDK_CONFIG, ROUTES);
    await child;
    expect(h.s.calls.loadFlags).toBe(1);
  });
});

// TBP-659 — the Stripe return lands on the app's own callback URL with a
// `redirect` query parameter. Anyone can craft that link, so the value is
// untrusted: only a same-origin path may be followed, everything else falls
// back to the default. Values are written into the URL the way an attacker
// would type them (raw or percent-encoded), not pre-encoded by the test.
describe('the Stripe callback only follows same-origin redirects (TBP-659)', () => {
  const DEFAULT = '/subscription';
  const callback = (query: string) => at(`/auth/oauth-callback?${query}`);

  const HOSTILE: Array<[string, string]> = [
    ['absolute URL', 'https://evil.test'],
    ['protocol-relative', '//evil.test'],
    ['backslash protocol-relative', '/\\evil.test'],
    ['javascript: scheme', 'javascript:alert(1)'],
    ['percent-encoded protocol-relative', '%2F%2Fevil.test'],
    ['tab-prefixed protocol-relative', '%09%2F%2Fevil.test'],
  ];

  async function landing(query: string) {
    const { bridgeBootstrap } = await load();
    const { status, location } = await redirectOf(bridgeBootstrap(callback(query), SDK_CONFIG, ROUTES));
    expect(status).toBe(303);
    return location;
  }

  it.each(HOSTILE)('cancel: %s → default route, never off-origin', async (_label, value) => {
    const location = await landing(`stripe_cancel=1&redirect=${value}`);
    expect(location).toBe(DEFAULT);
    expect(new URL(location, 'http://localhost').origin).toBe('http://localhost');
  });

  it.each(HOSTILE)('success: %s → default route, never off-origin', async (_label, value) => {
    const location = await landing(`stripe_success=1&session_id=cs_test_1&redirect=${value}`);
    expect(location).toBe(DEFAULT);
    expect(new URL(location, 'http://localhost').origin).toBe('http://localhost');
  });

  it('honours a same-origin path (query stripped, as before)', async () => {
    const value = encodeURIComponent('/billing?x=1');
    expect(await landing(`stripe_cancel=1&redirect=${value}`)).toBe('/billing');
    expect(await landing(`stripe_success=1&session_id=cs_test_1&redirect=${value}`)).toBe('/billing');
  });

  it('no redirect parameter → default route', async () => {
    expect(await landing('stripe_cancel=1')).toBe(DEFAULT);
  });
});
