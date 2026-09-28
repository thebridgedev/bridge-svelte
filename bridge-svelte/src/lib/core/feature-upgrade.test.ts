// TBP-756 — a feature that is off says why, and "not on the plan" sells the
// upgrade — but only after the person did something gated (owner rule:
// nothing opens by itself).
//
// Covers: the feature-upgrade store, a backend's 402 FEATURE_NOT_IN_PLAN
// reaching it, <FeatureFlag>'s fallback info and opt-in `upgrade` prompt
// (rendered with svelte/server), and the route-guard wrapper carrying the
// reason from auth-core's decision.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

let _restriction: unknown = null;

vi.mock('../client/stores/config.store.js', () => ({
  getRouteGuardConfig: () => ({ rules: [{ match: '/reports', featureFlag: 'reports' }] }),
  getConfig: () => ({ loginRoute: '/auth/login' }),
}));

vi.mock('./bridge-instance.js', () => ({
  getBridgeAuth: () => ({
    isAuthenticated: () => true,
    invalidateFeatureFlagCache: () => {},
    createRouteGuard: () => ({
      isPublicRoute: () => false,
      shouldRedirectToLogin: () => false,
      checkRouteRestrictions: async () => (_restriction as { to: string } | null)?.to ?? null,
      checkRouteRestriction: async () => _restriction,
      getLoginRedirect: () => '/auth/login',
      resolveReturnTo: () => null,
    }),
  }),
}));

const {
  featureUpgrade,
  openFeatureUpgrade,
  dismissFeatureUpgrade,
  parseFeatureRefusal,
  __resetFeatureUpgradeForTests,
} = await import('./feature-upgrade.js');
const { observeQuotaRefusal, quotaRefusal, __resetQuotaRefusalForTests } = await import('./quota-refusal.js');
const { setBridgeFlagsInstance } = await import('../flags/registry.js');
const { render } = await import('svelte/server');
const FeatureFlag = (await import('../flags/FeatureFlag.svelte')).default;
const Harness = (await import('./FeatureFlagFixture.test.svelte')).default;
const { createRouteGuard } = await import('../auth/route-guard.js');

beforeEach(() => {
  __resetFeatureUpgradeForTests();
  __resetQuotaRefusalForTests();
  setBridgeFlagsInstance(undefined);
  _restriction = null;
});

/** A BridgeFlags stand-in that answers one fixed evaluation. */
function flagsAnswering(result: Record<string, unknown>) {
  setBridgeFlagsInstance({ flag: () => result } as never);
}

describe('feature-upgrade store', () => {
  it('starts closed, opens with the flag and feature, closes on dismiss', () => {
    expect(get(featureUpgrade)).toBeNull();
    openFeatureUpgrade({ flag: 'reports', feature: 'analytics' });
    expect(get(featureUpgrade)).toEqual({ flag: 'reports', feature: 'analytics', fix: null });
    dismissFeatureUpgrade();
    expect(get(featureUpgrade)).toBeNull();
  });

  it('keeps only a same-app fix path', () => {
    openFeatureUpgrade({ flag: 'x', fix: 'https://evil.example/pay' });
    expect(get(featureUpgrade)?.fix).toBeNull();
    openFeatureUpgrade({ flag: 'x', fix: '/billing' });
    expect(get(featureUpgrade)?.fix).toBe('/billing');
  });
});

describe('a backend 402 FEATURE_NOT_IN_PLAN', () => {
  it('parses into an upgrade request; anything else is not one', () => {
    expect(parseFeatureRefusal({ code: 'FEATURE_NOT_IN_PLAN', flag: 'reports', feature: 'analytics', fix: '/subscription' }))
      .toEqual({ flag: 'reports', feature: 'analytics', fix: '/subscription' });
    expect(parseFeatureRefusal({ code: 'FEATURE_NOT_PERMITTED', flag: 'reports' })).toBeNull();
    expect(parseFeatureRefusal('nope')).toBeNull();
  });

  it('opens the feature variant through the same fetch observer as a plan limit', async () => {
    const res = new Response(
      JSON.stringify({ statusCode: 402, code: 'FEATURE_NOT_IN_PLAN', flag: 'reports', feature: 'analytics', fix: '/subscription' }),
      { status: 402, headers: { 'content-type': 'application/json' } },
    );
    await observeQuotaRefusal(res, '/api/reports');
    expect(get(featureUpgrade)).toEqual({ flag: 'reports', feature: 'analytics', fix: '/subscription' });
    expect(get(quotaRefusal)).toBeNull();
  });

  it('a 403 FEATURE_NOT_PERMITTED opens nothing', async () => {
    const res = new Response(JSON.stringify({ code: 'FEATURE_NOT_PERMITTED', flag: 'reports' }), { status: 403 });
    await observeQuotaRefusal(res, '/api/reports');
    expect(get(featureUpgrade)).toBeNull();
  });
});

describe('<FeatureFlag> (TBP-756)', () => {
  it('the fallback receives the reason and feature', () => {
    flagsAnswering({ passed: false, value: false, reason: 'plan', feature: 'analytics' });
    const html = render(Harness, { props: { mode: 'fallback' } }).body;
    expect(html).toContain('reason=plan');
    expect(html).toContain('feature=analytics');
  });

  it('a hidden feature with no fallback renders nothing and opens nothing', () => {
    flagsAnswering({ passed: false, value: false, reason: 'plan', feature: 'analytics' });
    const html = render(FeatureFlag as never, { props: { key: 'reports', defaultValue: false } as never }).body;
    expect(html).not.toContain('data-bridge-feature-upgrade');
    expect(get(featureUpgrade)).toBeNull();
  });

  it('`upgrade` shows the inline prompt for a plan reason only, and still opens nothing by itself', () => {
    flagsAnswering({ passed: false, value: false, reason: 'plan', feature: 'analytics' });
    const plan = render(FeatureFlag as never, { props: { key: 'reports', defaultValue: false, upgrade: true } as never }).body;
    expect(plan).toContain('data-bridge-feature-upgrade="reports"');
    expect(get(featureUpgrade)).toBeNull();

    flagsAnswering({ passed: false, value: false, reason: 'permission' });
    const role = render(FeatureFlag as never, { props: { key: 'reports', defaultValue: false, upgrade: true } as never }).body;
    expect(role).not.toContain('data-bridge-feature-upgrade');
  });

  it('openUpgrade from the fallback opens the dialog for this flag and feature', () => {
    flagsAnswering({ passed: false, value: false, reason: 'plan', feature: 'analytics' });
    // `.body` is what renders (svelte/server renders lazily).
    expect(render(Harness, { props: { mode: 'click' } }).body).toBeDefined();
    expect(get(featureUpgrade)).toEqual({ flag: 'reports', feature: 'analytics', fix: null });
  });
});

describe('route guard wrapper carries the reason (TBP-756)', () => {
  it('a plan-gated route is a redirect with reason plan, flag and feature', async () => {
    _restriction = { to: '/home', reason: 'plan', flag: 'reports', feature: 'analytics' };
    const guard = createRouteGuard(Promise.resolve());
    expect(await guard.getNavigationDecision('/reports')).toEqual({
      type: 'redirect',
      to: '/home',
      reason: 'plan',
      flag: 'reports',
      feature: 'analytics',
    });
    expect(await guard.checkRouteRestrictions('/reports')).toBe('/home');
  });

  it('a restriction with no reason is the plain redirect', async () => {
    _restriction = { to: '/' };
    const guard = createRouteGuard(Promise.resolve());
    expect(await guard.getNavigationDecision('/reports')).toEqual({ type: 'redirect', to: '/' });
  });
});
