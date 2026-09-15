// TBP-575 — the filter that decides whether a flag change is worth re-checking
// the current route for.
//
// Getting this wrong is silent in both directions: too narrow and the live
// re-check never fires (the feature looks broken), too wide and every flag
// flip costs every connected client a bulkEvaluate round-trip.
//
// Also covers the guard wrapper's two safety properties: it fails closed
// (TBP-653) and it does not trust a cache read that an invalidation overtook
// (TBP-654).

import { describe, it, expect, vi, beforeEach } from 'vitest';

let _rules: unknown[] = [];
let _authenticated = true;
let _invalidateCalls = 0;
let _checkImpl: (pathname: string) => Promise<string | null> = async () => null;
let _loginCheckImpl: (pathname: string) => boolean = () => false;

vi.mock('../client/stores/config.store.js', () => ({
  getRouteGuardConfig: () => ({ rules: _rules }),
  getConfig: () => ({ loginRoute: '/auth/login' }),
}));

vi.mock('../core/bridge-instance.js', () => ({
  getBridgeAuth: () => ({
    isAuthenticated: () => _authenticated,
    invalidateFeatureFlagCache: () => { _invalidateCalls += 1; },
    createRouteGuard: () => ({
      isPublicRoute: (p: string) => p === '/' || p.startsWith('/auth'),
      shouldRedirectToLogin: (p: string) => _loginCheckImpl(p),
      checkRouteRestrictions: (p: string) => _checkImpl(p),
      getLoginRedirect: () => 'https://hosted.example/login',
      resolveReturnTo: (attempted: string) => attempted,
    }),
  }),
}));

const { routeRulesReferenceFlag, createRouteGuard } = await import('./route-guard.js');
const { invalidateRouteGuardCache } = await import('./guard-cache.js');

beforeEach(() => {
  _rules = [];
  _authenticated = true;
  _invalidateCalls = 0;
  _checkImpl = async () => null;
  _loginCheckImpl = () => false;
});

describe('routeRulesReferenceFlag', () => {
  it('matches a plain string requirement', () => {
    _rules = [{ match: '/lab', featureFlag: 'holo-experimental' }];
    expect(routeRulesReferenceFlag('holo-experimental')).toBe(true);
    expect(routeRulesReferenceFlag('something-else')).toBe(false);
  });

  it('matches inside an `any` requirement', () => {
    _rules = [{ match: '/lab', featureFlag: { any: ['a', 'b'] } }];
    expect(routeRulesReferenceFlag('b')).toBe(true);
    expect(routeRulesReferenceFlag('c')).toBe(false);
  });

  it('matches inside an `all` requirement', () => {
    _rules = [{ match: '/lab', featureFlag: { all: ['a', 'b'] } }];
    expect(routeRulesReferenceFlag('a')).toBe(true);
    expect(routeRulesReferenceFlag('c')).toBe(false);
  });

  it('ignores rules with no flag requirement', () => {
    _rules = [{ match: '/public', public: true }, { match: '/billing', billing: 'hard' }];
    expect(routeRulesReferenceFlag('anything')).toBe(false);
  });

  it('scans every rule, not just the first', () => {
    _rules = [
      { match: '/a', featureFlag: 'one' },
      { match: '/b', public: true },
      { match: '/c', featureFlag: 'two' },
    ];
    expect(routeRulesReferenceFlag('two')).toBe(true);
  });

  it('survives an empty or absent rule set', () => {
    _rules = [];
    expect(routeRulesReferenceFlag('x')).toBe(false);
  });
});

describe('guard decisions do not trust a read an invalidation overtook (TBP-654)', () => {
  it('re-evaluates when the cache was invalidated while the check was in flight', async () => {
    _rules = [{ match: '/pro', featureFlag: 'pro-page', redirectTo: '/' }];
    let reads = 0;
    _checkImpl = async () => {
      reads += 1;
      if (reads === 1) {
        // The plan upgrade lands while the (Free-plan) verdict is in flight.
        invalidateRouteGuardCache();
        return '/';
      }
      return null;
    };
    const decision = await createRouteGuard().getNavigationDecision('/pro', '/pro');
    expect(decision).toEqual({ type: 'allow' });
    expect(reads).toBe(2);
    // One from the invalidation itself, one to discard the stale write-back.
    expect(_invalidateCalls).toBe(2);
  });

  it('reads once when nothing changed underneath', async () => {
    let reads = 0;
    _checkImpl = async () => { reads += 1; return null; };
    await createRouteGuard().getNavigationDecision('/pro', '/pro');
    expect(reads).toBe(1);
    expect(_invalidateCalls).toBe(0);
  });

  it('gives up re-reading after a bounded number of attempts', async () => {
    let reads = 0;
    _checkImpl = async () => { reads += 1; invalidateRouteGuardCache(); return '/'; };
    await createRouteGuard().getNavigationDecision('/pro', '/pro');
    expect(reads).toBe(3);
  });
});

describe('guard decisions fail closed (TBP-653)', () => {
  it('a restriction check that throws redirects a signed-in user where the rule sends failures', async () => {
    _rules = [{ match: '/pro', featureFlag: 'pro-page', redirectTo: '/upgrade' }];
    _checkImpl = async () => { throw new Error('bulkEvaluate 503'); };
    expect(await createRouteGuard().getNavigationDecision('/pro', '/pro')).toEqual({ type: 'redirect', to: '/upgrade' });
  });

  it('a signed-out visitor whose check throws is sent to login, with the return target', async () => {
    _authenticated = false;
    _loginCheckImpl = () => { throw new Error('malformed rule'); };
    expect(await createRouteGuard().getNavigationDecision('/admin', '/admin?x=1')).toEqual({
      type: 'login',
      loginUrl: 'https://hosted.example/login',
      returnTo: '/admin?x=1',
    });
  });

  it('a public route with no requirement stays reachable when the check throws', async () => {
    _checkImpl = async () => { throw new Error('bulkEvaluate 503'); };
    expect(await createRouteGuard().getNavigationDecision('/', '/')).toEqual({ type: 'allow' });
  });

  it('a public route WITH a flag requirement is denied when the check throws', async () => {
    _rules = [{ match: '/', public: true, featureFlag: 'landing', redirectTo: '/auth/login' }];
    _checkImpl = async () => { throw new Error('bulkEvaluate 503'); };
    expect(await createRouteGuard().getNavigationDecision('/', '/')).toEqual({ type: 'redirect', to: '/auth/login' });
  });
});
