// TBP-575 — the filter that decides whether a flag change is worth re-checking
// the current route for.
//
// Getting this wrong is silent in both directions: too narrow and the live
// re-check never fires (the feature looks broken), too wide and every flag
// flip costs every connected client a bulkEvaluate round-trip.

import { describe, it, expect, vi } from 'vitest';

let _rules: unknown[] = [];

vi.mock('../client/stores/config.store.js', () => ({
  getRouteGuardConfig: () => ({ rules: _rules }),
}));

vi.mock('../core/bridge-instance.js', () => ({
  getBridgeAuth: () => ({ createRouteGuard: () => ({}) }),
}));

const { routeRulesReferenceFlag } = await import('./route-guard.js');

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
