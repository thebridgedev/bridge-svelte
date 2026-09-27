// TBP-702 — one file serves the subscription page, the paywall, and the pages a
// checkout returns to.
//
// The plugin used to redirect to `/payment-error` and point every Manage/Upgrade
// button at `/billing`, and no guide told anyone to create either page — so a
// guide-following app had two 404s waiting for the first failed checkout and the
// first "Manage billing" click. With `src/routes/subscription/[...bridge]/+page.svelte`
// rendering `<BridgeBillingRoutes />`, the defaults below point at pages that
// exist.
//
// This module is the page list, its parser and the route defaults. It is shared
// by the component (which page to render), by the CTA components (where Manage
// goes), and by `bridgeBootstrap()` (where the paywall and a failed checkout go,
// and which unknown segment is a 404).

import type { BridgeConfig } from '../shared/types/config.js';
import { getConfig } from './stores/config.store.js';

/** Every page `<BridgeBillingRoutes>` serves. `manage` is the catch-all's own address. */
export const BRIDGE_BILLING_PAGES = ['manage', 'plan', 'success', 'error'] as const;

/** One of the pages `<BridgeBillingRoutes>` serves. */
export type BridgeBillingPage = (typeof BRIDGE_BILLING_PAGES)[number];

/** A parsed billing route. */
export interface BridgeBillingRoute {
  page: BridgeBillingPage;
}

/**
 * Parse the `[...bridge]` rest parameter into a billing page, or `null` when it
 * names none — the caller then answers with the app's own 404.
 *
 * The bare address (`/subscription`, rest `''`) is the manage page; `plan`,
 * `success` and `error` are one segment each. Nothing deeper matches.
 */
export function parseBridgeBillingRoute(rest: string | undefined | null): BridgeBillingRoute | null {
  if (typeof rest !== 'string') return null;
  const segments = rest.split('/').filter((s) => s !== '');
  if (segments.length === 0) return { page: 'manage' };
  if (segments.length !== 1) return null;
  const [first] = segments;
  if (first === 'plan' || first === 'success' || first === 'error') return { page: first };
  return null;
}

/** Where each billing destination points when the app configures nothing. */
export const BRIDGE_BILLING_DEFAULTS = {
  manageRoute: '/subscription',
  paywallRoute: '/subscription/plan',
  paymentErrorRoute: '/subscription/error',
} as const;

/** The billing destinations in effect. */
export interface BridgeBillingRoutes {
  /** The subscription page — where Manage/Upgrade buttons go. */
  manageRoute: string;
  /** Where a plan-less workspace is sent; `null` when the redirect is turned off. */
  paywallRoute: string | null;
  /**
   * True when `paywallRoute` is the built-in default rather than the app's own
   * choice. The default only applies to an app that uses billing — see
   * `appUsesBilling` — so an app that never set billing up, where every
   * workspace is plan-less, is not sent to a page it does not have.
   */
  paywallIsDefault: boolean;
  /** Where a failed checkout confirmation lands. */
  paymentErrorRoute: string;
  /** Where a completed checkout lands by default: `<manageRoute>/success`. */
  successRoute: string;
}

/**
 * Resolve the billing destinations from a `billing` config block. An unset
 * route takes its default; `paywallRoute: false` turns the paywall redirect off
 * (for an app that gates with the `<BridgePaywall>` overlay, or not at all).
 */
export function resolveBillingRoutes(billing?: BridgeConfig['billing']): BridgeBillingRoutes {
  const manageRoute = billing?.manageRoute || BRIDGE_BILLING_DEFAULTS.manageRoute;
  const paywall = billing?.paywallRoute;
  return {
    manageRoute,
    paywallRoute: paywall === false ? null : paywall || BRIDGE_BILLING_DEFAULTS.paywallRoute,
    paywallIsDefault: paywall !== false && !paywall,
    paymentErrorRoute: billing?.paymentErrorRoute || BRIDGE_BILLING_DEFAULTS.paymentErrorRoute,
    successRoute: `${manageRoute.replace(/\/+$/, '')}/success`,
  };
}

/**
 * The billing destinations for the running app. Before the config exists (a
 * component rendered outside `<BridgeBootstrap>`, or a unit test) the defaults
 * apply — the same answer an app that configures nothing gets.
 */
export function billingRoutes(): BridgeBillingRoutes {
  let billing: BridgeConfig['billing'];
  try {
    billing = getConfig().billing;
  } catch {
    billing = undefined;
  }
  return resolveBillingRoutes(billing);
}

/**
 * Whether the app uses billing, for the default paywall (TBP-702): it has at
 * least one plan. Every workspace of an app with no billing is plan-less
 * (`shouldSelectPlan` is true whenever a workspace has no plan), so without this
 * the default would send all of its users to `/subscription/plan`.
 *
 * The plan catalogue is the app-level signal the client can see. The
 * subscription status's `paymentsEnabled` is per workspace (it has a Stripe
 * customer and subscription), so it is false for every plan-less workspace, and
 * the app config and the token carry no billing flag. `paymentsAutoRedirect` is
 * checked separately, by the paywall decision itself.
 */
export function appUsesBilling(plans: readonly unknown[] | null | undefined): boolean {
  return Array.isArray(plans) && plans.length > 0;
}

/**
 * Whether the paywall redirect must leave `pathname` alone: the paywall itself
 * (no loop), and the payment-error page — a plan-less workspace whose checkout
 * failed has to be able to read why, not be bounced straight back to the plans.
 */
export function isPaywallExempt(pathname: string, routes: BridgeBillingRoutes): boolean {
  return pathname === routes.paywallRoute || pathname === routes.paymentErrorRoute;
}
