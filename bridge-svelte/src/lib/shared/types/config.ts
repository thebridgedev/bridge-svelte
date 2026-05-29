import type { BridgeAuthConfig } from '@nebulr-group/bridge-auth-core';

export type { TokenSet } from '@nebulr-group/bridge-auth-core';

export interface BridgeConfig extends BridgeAuthConfig {
  /** Route where your signup page lives (e.g. '/auth/signup').
   *  Used by LoginForm to link to the signup page. */
  signupRoute?: string;

  /** Billing paywall configuration. When set, Bridge redirects unauthenticated
   *  or plan-less users to `paywallRoute` before the page renders. */
  billing?: {
    /** Route to redirect to when the tenant has no plan selected.
     *  e.g. '/onboarding/plan' or '/subscription' */
    paywallRoute?: string;
    /** Route to redirect to when a Stripe checkout confirmation fails.
     *  Defaults to '/payment-error'. */
    paymentErrorRoute?: string;
  };
}
