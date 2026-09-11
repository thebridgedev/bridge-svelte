import type { BridgeAuthConfig, MessageOverrides } from '@nebulr-group/bridge-auth-core';

export type { TokenSet } from '@nebulr-group/bridge-auth-core';

export interface BridgeConfig extends BridgeAuthConfig {
  /** Route where your signup page lives (e.g. '/auth/signup').
   *  Used by LoginForm to link to the signup page. */
  signupRoute?: string;

  /** UI language for the SDK auth components, e.g. 'sv' or 'sv-SE' (TBP-630).
   *  Region variants resolve to their primary subtag; an unknown locale falls
   *  back to English rather than throwing.
   *  @default 'en' */
  locale?: string;

  /** Per-key copy overrides applied on top of the resolved locale, for wording
   *  an app genuinely needs to differ. Highest precedence in the chain. */
  messages?: MessageOverrides;

  /** Billing paywall configuration. When set, Bridge redirects unauthenticated
   *  or plan-less users to `paywallRoute` before the page renders. */
  billing?: {
    /** Route to redirect to when the tenant has no plan selected.
     *  e.g. '/onboarding/plan' or '/subscription' */
    paywallRoute?: string;
    /** Route to redirect to when a Stripe checkout confirmation fails.
     *  Defaults to '/payment-error'. */
    paymentErrorRoute?: string;
    /** Route where your plan/billing management page lives — the default
     *  destination of the Upgrade/Manage CTA in <BridgeQuotaBanner> and
     *  <BridgeBillingNotice>. Defaults to '/billing'. */
    manageRoute?: string;
  };
}
