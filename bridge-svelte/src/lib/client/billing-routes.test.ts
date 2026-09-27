// TBP-702 — the page list behind <BridgeBillingRoutes> and the billing defaults.
import { describe, it, expect } from 'vitest';
import {
  BRIDGE_BILLING_DEFAULTS,
  BRIDGE_BILLING_PAGES,
  isPaywallExempt,
  parseBridgeBillingRoute,
  resolveBillingRoutes,
} from './billing-routes.js';

describe('parseBridgeBillingRoute', () => {
  it('serves the subscription page, the paywall and the two checkout return pages', () => {
    expect([...BRIDGE_BILLING_PAGES].sort()).toEqual(['error', 'manage', 'plan', 'success']);
  });

  it('reads the catch-all’s own address as the subscription page', () => {
    expect(parseBridgeBillingRoute('')).toEqual({ page: 'manage' });
  });

  it('reads each one-segment page', () => {
    expect(parseBridgeBillingRoute('plan')).toEqual({ page: 'plan' });
    expect(parseBridgeBillingRoute('success')).toEqual({ page: 'success' });
    expect(parseBridgeBillingRoute('error')).toEqual({ page: 'error' });
  });

  it('refuses anything else, so it 404s', () => {
    for (const rest of ['manage', 'nope', 'plan/x', 'success/x/y', 'PLAN', 'login']) {
      expect(parseBridgeBillingRoute(rest)).toBeNull();
    }
    expect(parseBridgeBillingRoute(undefined)).toBeNull();
    expect(parseBridgeBillingRoute(null)).toBeNull();
  });
});

describe('resolveBillingRoutes', () => {
  it('points every destination at a page the catch-all serves when nothing is configured', () => {
    expect(resolveBillingRoutes(undefined)).toEqual({
      manageRoute: '/subscription',
      paywallRoute: '/subscription/plan',
      paymentErrorRoute: '/subscription/error',
      successRoute: '/subscription/success',
    });
    expect(BRIDGE_BILLING_DEFAULTS.manageRoute).toBe('/subscription');
  });

  it('a configured route wins, and the success page follows manageRoute', () => {
    const r = resolveBillingRoutes({ manageRoute: '/billing/', paywallRoute: '/welcome', paymentErrorRoute: '/oops' });
    expect(r).toEqual({
      manageRoute: '/billing/',
      paywallRoute: '/welcome',
      paymentErrorRoute: '/oops',
      successRoute: '/billing/success',
    });
  });

  it('paywallRoute: false turns the paywall off', () => {
    expect(resolveBillingRoutes({ paywallRoute: false }).paywallRoute).toBeNull();
  });

  it('an empty string counts as unset', () => {
    expect(resolveBillingRoutes({ manageRoute: '', paywallRoute: '' }).paywallRoute).toBe('/subscription/plan');
  });
});

describe('isPaywallExempt', () => {
  const routes = resolveBillingRoutes(undefined);

  it('never redirects the paywall to itself', () => {
    expect(isPaywallExempt('/subscription/plan', routes)).toBe(true);
  });

  it('leaves the payment-error page readable', () => {
    expect(isPaywallExempt('/subscription/error', routes)).toBe(true);
  });

  it('gates everything else, the subscription page included', () => {
    expect(isPaywallExempt('/subscription', routes)).toBe(false);
    expect(isPaywallExempt('/dashboard', routes)).toBe(false);
  });
});
