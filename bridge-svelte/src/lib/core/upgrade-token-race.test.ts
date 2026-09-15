// Regression (TBP-654, upgrade race) — found by the M33 clean-room smoke on
// stage, 2 of 6 runs:
//
//   +484 ms  subscription.plan_changed → the page shows "Pro"
//   +489 ms  the user clicks into the plan-gated /pro
//            → the route guard evaluates the plan-targeted rule with the OLD
//              (Free) access token → refused, bounced to /dashboard
//   +774 ms  the token refresh (started by user.state_changed) lands
//
// Real runtime + real route-guard wrapper + real guard cache. Only the edges
// are faked: auth-core's BridgeAuth (token store, refresh, the rule check,
// which answers from the plan claim of whatever token is current) and its
// realtime client (so the test can deliver the pushes). Timers are fake so the
// bound is exact.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  const enc = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = (claims: Record<string, unknown>) => `${enc({ alg: 'HS256' })}.${enc(claims)}.sig`;
  const base = { sub: 'user-1', tid: 'ws-1', aid: 'app-1' };
  return {
    jwt,
    FREE: jwt({ ...base, plan: 'free', tv: 1 }),
    // Minted after the plan was saved but BEFORE the server bumped tokenVersion.
    PRO_PRE_BUMP: jwt({ ...base, plan: 'pro', tv: 1 }),
    PRO: jwt({ ...base, plan: 'pro', tv: 2 }),
    tokenStore: undefined as unknown as import('svelte/store').Writable<{ accessToken: string } | null>,
    refreshCalls: 0,
    refreshImpl: (() => Promise.resolve(null)) as () => Promise<unknown>,
    // Which token each /pro rule evaluation ran with.
    evaluatedWith: [] as Array<string | null>,
    checkDelayMs: 0,
    billing: undefined as undefined | Record<string, (msg: unknown) => void>,
    onUserState: undefined as undefined | ((msg: Record<string, unknown>) => Promise<void>),
  };
});

vi.mock('./bridge-instance.js', async () => {
  const { writable, get } = await import('svelte/store');
  h.tokenStore = writable(null);
  const current = () => get(h.tokenStore)?.accessToken ?? null;
  const planOf = (token: string | null) => {
    try {
      return token ? JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).plan : null;
    } catch {
      return null;
    }
  };
  const isPublic = (p: string) => p === '/' || p.startsWith('/auth');
  return {
    get tokenStore() {
      return h.tokenStore;
    },
    getBridgeAuth: () => ({
      getApiContext: () => ({ appId: 'app-1', accessToken: current() }),
      getTokens: () => (current() ? { accessToken: current() } : null),
      isAuthenticated: () => !!current(),
      refreshTokens: () => {
        h.refreshCalls += 1;
        return h.refreshImpl();
      },
      invalidateFeatureFlagCache: () => {},
      createRouteGuard: () => ({
        isPublicRoute: isPublic,
        shouldRedirectToLogin: (p: string) => !isPublic(p) && !current(),
        // `/pro` is gated on flag `pro-page` = `tenant.plan in [pro]`, and the
        // server reads the plan from the token the SDK sends.
        async checkRouteRestrictions(p: string) {
          if (p !== '/pro') return null;
          const token = current();
          if (h.checkDelayMs) await new Promise((r) => setTimeout(r, h.checkDelayMs));
          h.evaluatedWith.push(token);
          return planOf(token) === 'pro' ? null : '/dashboard';
        },
        getLoginRedirect: () => 'https://hosted.example/login',
        resolveReturnTo: (attempted: string) => attempted,
      }),
    }),
  };
});

vi.mock('../client/stores/config.store.js', () => ({
  getConfig: () => ({ appId: 'app-1', apiBaseUrl: 'http://test', loginRoute: '/auth/login' }),
  getRouteGuardConfig: () => ({
    rules: [
      { match: '/', public: true },
      { match: '/pro', featureFlag: 'pro-page', redirectTo: '/dashboard' },
    ],
    defaultAccess: 'protected',
  }),
}));

vi.mock('./snapshot-stores.js', () => ({
  applySessionSnapshot: vi.fn(),
  applySubscriptionPlanChanged: vi.fn(),
  applyEntitlementsChanged: vi.fn(),
  applyCatchUpSnapshot: vi.fn(() => ({ planChanged: false, entitlementsChanged: false })),
}));

vi.mock('./events.js', () => ({ bridgeEvents: { _dispatch: vi.fn() } }));

vi.mock('@nebulr-group/bridge-auth-core', () => {
  class FakeRealtimeClient {
    setOnOpen() {}
    setOnClose() {}
    setOnSnapshot() {}
    setOnDegraded() {}
    setOnFlagChange() {}
    setOnStatusChange() {}
    setOnUserState(fn: (msg: Record<string, unknown>) => Promise<void>) {
      h.onUserState = fn;
    }
    setAppId() {}
    setWorkspaceId() {}
    setUserId() {}
    async reauthorize() {}
    async start() {}
    async stop() {}
  }
  return {
    RealtimeClient: FakeRealtimeClient,
    useBridge: () => ({
      quotas: { configure: () => {} },
      attachToRealtimeClient: () => {},
      entitlementsStore: { applyEntitlementsChanged: () => {} },
      handle: (handlers: Record<string, (msg: unknown) => void>) => {
        h.billing = handlers;
        return () => {};
      },
    }),
  };
});

const { startBridgeRuntime, stopBridgeRuntime, __resetBridgeRuntime } = await import('./bridge-runtime.js');
const { createRouteGuard } = await import('../auth/route-guard.js');

const PLAN_CHANGED = {
  kind: 'subscription.plan_changed',
  tenantId: 'ws-1',
  from: { slug: 'free' },
  to: { slug: 'pro', name: 'Pro' },
  status: 'active',
  effectiveAt: '2026-09-15T10:00:00.000Z',
};
const ENTITLEMENTS_CHANGED = {
  kind: 'entitlements.changed',
  tenantId: 'ws-1',
  effectiveAt: '2026-09-15T10:00:00.000Z',
  entitlements: { pro_page: true },
};

// The server mints `token`; it lands `ms` after the refresh starts.
function refreshLandsAfter(ms: number, token: string = h.PRO) {
  return () =>
    new Promise((resolve) => {
      setTimeout(() => {
        h.tokenStore.set({ accessToken: token });
        resolve({ accessToken: token });
      }, ms);
    });
}

// Settle-tracking wrapper: lets a test assert a decision has NOT been made yet.
function track<T>(p: Promise<T>) {
  const state: { done: boolean; value?: T } = { done: false };
  void p.then((value) => {
    state.done = true;
    state.value = value;
  });
  return state;
}

function signedInOnFree() {
  h.tokenStore.set({ accessToken: h.FREE });
  startBridgeRuntime();
}

beforeEach(() => {
  vi.useFakeTimers();
  h.refreshCalls = 0;
  h.refreshImpl = refreshLandsAfter(300);
  h.evaluatedWith = [];
  h.checkDelayMs = 0;
  h.billing = undefined;
  h.onUserState = undefined;
  h.tokenStore.set(null);
});

afterEach(async () => {
  await stopBridgeRuntime();
  __resetBridgeRuntime();
  vi.useRealTimers();
});

describe('a plan change makes route decisions wait for the refreshed token (TBP-654)', () => {
  it('plan_changed, then an immediate navigation → the guard waits for the refresh and allows with the new token', async () => {
    signedInOnFree();
    h.billing!['subscription.plan_changed'](PLAN_CHANGED); // the page now says Pro
    const decision = track(createRouteGuard().getNavigationDecision('/pro', '/pro')); // …and the user clicks

    await vi.advanceTimersByTimeAsync(299);
    expect(decision.done, 'no verdict while the upgraded token is still on its way').toBe(false);
    expect(h.evaluatedWith).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(decision.done).toBe(true));
    expect(decision.value).toEqual({ type: 'allow' });
    expect(h.evaluatedWith).toEqual([h.PRO]);
    expect(h.refreshCalls).toBe(1);
  });

  it('the refresh starts on plan_changed itself — it does not wait for user.state_changed', () => {
    signedInOnFree();
    h.billing!['subscription.plan_changed'](PLAN_CHANGED);
    expect(h.refreshCalls).toBe(1);
  });

  it('a decision already in flight when the plan changes re-reads with the new token', async () => {
    signedInOnFree();
    h.checkDelayMs = 100;
    const decision = track(createRouteGuard().getNavigationDecision('/pro', '/pro')); // Free read in flight
    await vi.advanceTimersByTimeAsync(10);
    h.billing!['subscription.plan_changed'](PLAN_CHANGED);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(decision.done).toBe(true));
    expect(decision.value).toEqual({ type: 'allow' });
    expect(h.evaluatedWith).toEqual([h.FREE, h.PRO]);
  });

  it('a refresh slower than the 3 s bound → decided at the bound with the token it has: fail closed', async () => {
    signedInOnFree();
    h.refreshImpl = refreshLandsAfter(10_000);
    h.billing!['subscription.plan_changed'](PLAN_CHANGED);
    const decision = track(createRouteGuard().getNavigationDecision('/pro', '/pro'));

    await vi.advanceTimersByTimeAsync(2_999);
    expect(decision.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(decision.done).toBe(true));
    expect(decision.value).toEqual({ type: 'redirect', to: '/dashboard' });
    expect(h.evaluatedWith).toEqual([h.FREE]);
  });

  it('a refresh that fails does not hang the guard or let the route through', async () => {
    signedInOnFree();
    h.refreshImpl = () => Promise.reject(new Error('refresh 500'));
    h.billing!['subscription.plan_changed'](PLAN_CHANGED);
    await expect(createRouteGuard().getNavigationDecision('/pro', '/pro')).resolves.toEqual({
      type: 'redirect',
      to: '/dashboard',
    });
  });

  it('plan_changed + entitlements.changed + user.state_changed in quick succession → ONE refresh', async () => {
    signedInOnFree();
    h.billing!['subscription.plan_changed'](PLAN_CHANGED);
    await vi.advanceTimersByTimeAsync(40);
    h.billing!['entitlements.changed'](ENTITLEMENTS_CHANGED);
    await vi.advanceTimersByTimeAsync(40);
    // The joined refresh already carries the version this message announces.
    const userState = h.onUserState!({ kind: 'user.state_changed', reason: 'plan_changed', tokenVersion: 2 });
    expect(h.refreshCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(300);
    await userState; // user.state_changed's handler waits for the refresh it joined
    await expect(createRouteGuard().getNavigationDecision('/pro', '/pro')).resolves.toEqual({ type: 'allow' });
    // The new token re-runs the authorization change once, without refreshing again.
    expect(h.refreshCalls).toBe(1);
  });

  it('a navigation with no change pending decides at once — no wait, no refresh', async () => {
    signedInOnFree();
    await expect(createRouteGuard().getNavigationDecision('/pro', '/pro')).resolves.toEqual({
      type: 'redirect',
      to: '/dashboard',
    });
    expect(h.refreshCalls).toBe(0);
  });
});

// The early refresh is minted after the plan is saved but can land BEFORE the
// server bumps tokenVersion (it bumps after publishing plan_changed). That
// token has the new plan but is TOKEN_VERSION_STALE for every version-checked
// endpoint — seen on stage as /billing/state 401 → "Subscription unavailable".
describe('a joined refresh that predates the announced token version is followed up once (TBP-654)', () => {
  it('user.state_changed announces tv 2 while the joined refresh mints tv 1 → one follow-up refresh to tv 2', async () => {
    signedInOnFree();
    let minted = 0;
    h.refreshImpl = () => {
      minted += 1;
      return refreshLandsAfter(300, minted === 1 ? h.PRO_PRE_BUMP : h.PRO)();
    };
    h.billing!['subscription.plan_changed'](PLAN_CHANGED);
    await vi.advanceTimersByTimeAsync(40);
    const userState = h.onUserState!({ kind: 'user.state_changed', reason: 'plan_changed', tokenVersion: 2 });
    expect(h.refreshCalls).toBe(1); // joined, not duplicated

    await vi.advanceTimersByTimeAsync(300); // the pre-bump token lands
    expect(h.refreshCalls).toBe(2); // …and is behind tv 2 → one follow-up
    await vi.advanceTimersByTimeAsync(300);
    await userState;
    expect(get(h.tokenStore)?.accessToken).toBe(h.PRO);
    expect(h.refreshCalls).toBe(2);
  });

  it('a navigation during the follow-up waits for it too, within the same bound', async () => {
    signedInOnFree();
    let minted = 0;
    h.refreshImpl = () => {
      minted += 1;
      return refreshLandsAfter(300, minted === 1 ? h.PRO_PRE_BUMP : h.PRO)();
    };
    h.billing!['subscription.plan_changed'](PLAN_CHANGED);
    void h.onUserState!({ kind: 'user.state_changed', reason: 'plan_changed', tokenVersion: 2 });
    const decision = track(createRouteGuard().getNavigationDecision('/pro', '/pro'));
    await vi.advanceTimersByTimeAsync(600);
    await vi.waitFor(() => expect(decision.done).toBe(true));
    expect(decision.value).toEqual({ type: 'allow' });
    expect(h.evaluatedWith).toEqual([h.PRO]);
  });

  it('no version on the message (older server) → the single refresh stands', async () => {
    signedInOnFree();
    h.refreshImpl = refreshLandsAfter(300, h.PRO_PRE_BUMP);
    h.billing!['subscription.plan_changed'](PLAN_CHANGED);
    const userState = h.onUserState!({ kind: 'user.state_changed', reason: 'plan_changed' });
    await vi.advanceTimersByTimeAsync(300);
    await userState;
    expect(h.refreshCalls).toBe(1);
  });
});

describe('signed-out visitors are unaffected (TBP-654)', () => {
  it('no token → the events start no refresh and a protected route goes straight to login', async () => {
    startBridgeRuntime();
    h.billing!['subscription.plan_changed'](PLAN_CHANGED);
    await h.onUserState!({ kind: 'user.state_changed', reason: 'plan_changed', tokenVersion: 5 });
    expect(h.refreshCalls).toBe(0);
    // Resolves without any timer advancing: nothing to wait for.
    await expect(createRouteGuard().getNavigationDecision('/pro', '/pro?x=1')).resolves.toEqual({
      type: 'login',
      loginUrl: 'https://hosted.example/login',
      returnTo: '/pro?x=1',
    });
    await expect(createRouteGuard().getNavigationDecision('/', '/')).resolves.toEqual({ type: 'allow' });
  });
});

import { get } from 'svelte/store';
