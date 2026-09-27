import type { BridgeAuthConfig, MessageOverrides } from '@nebulr-group/bridge-auth-core';
import type { Component } from 'svelte';
import type { BridgeQuotaRefusal } from '../../core/quota-refusal.js';

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

  /** Show the "Live updates off — why?" corner badge that <BridgeBootstrap />
   *  mounts while realtime is refused, degraded or stuck retrying (TBP-644).
   *  It only ever renders in development builds; set `false` to hide it there
   *  too. Production builds never show it, whatever this says.
   *  @default true */
  devBadge?: boolean;

  /** Billing destinations. Every one has a default served by
   *  `<BridgeBillingRoutes />` at `src/routes/subscription/[...bridge]/+page.svelte`
   *  (TBP-702), so an app that configures nothing redirects only to pages that
   *  exist. Set one to move it — e.g. `paywallRoute: '/welcome'` for an
   *  onboarding page rendering `<BridgePaywallPage />`. */
  billing?: {
    /** Where a signed-in workspace with no plan is redirected, before any page
     *  renders. The default applies only to an app that has plans (an app
     *  without billing has only plan-less workspaces); a value set here always
     *  applies. `false` turns the redirect off — for an app that gates with the
     *  `<BridgePaywall>` overlay instead, or not at all. Workspaces of an app
     *  with `paymentsAutoRedirect` off are never redirected.
     *  @default '/subscription/plan' */
    paywallRoute?: string | false;
    /** Where a failed Stripe checkout confirmation lands.
     *  @default '/subscription/error' */
    paymentErrorRoute?: string;
    /** The subscription page — the default destination of the Upgrade/Manage
     *  CTA in <BridgeQuotaBanner> and <BridgeBillingNotice>. A completed
     *  checkout lands on `<manageRoute>/success` by default.
     *  @default '/subscription' */
    manageRoute?: string;
    /** The dialog `<BridgeBootstrap />` opens when your backend refuses a
     *  request because a plan limit is reached — a `402` whose JSON body has
     *  `code: 'QUOTA_EXCEEDED'`, which bridge-nestjs's `@RequireQuota` sends
     *  (TBP-703). It names the metric and links to the body's `fix` path, else
     *  to `manageRoute`. `false` turns it off (listen with
     *  `onBridgeQuotaExceeded()` instead); a component replaces it and receives
     *  `BridgeUpgradeDialogProps`.
     *  @default true */
    upgradeDialog?: boolean | Component<BridgeUpgradeDialogProps>;
    /** Origins of your own backend when it is not on the page's origin, e.g.
     *  `['https://api.example.com']`. A `402 QUOTA_EXCEEDED` from the page's
     *  origin, from Bridge's API, or from a call made with `bridgeFetch()` is
     *  always recognised; one from any other origin only when it is listed
     *  here. */
    apiOrigins?: string[];
  };
}

/** Props the upgrade dialog receives — the default one, or yours via
 *  `billing.upgradeDialog: MyDialog`. */
export interface BridgeUpgradeDialogProps {
  /** The refusal to explain, or `null` while nothing has been refused. */
  refusal: BridgeQuotaRefusal | null;
  /** Where the upgrade button goes: the refusal's `fix` path, else `billing.manageRoute`. */
  upgradeHref: string;
  /** Close the dialog. */
  onclose: () => void;
}
