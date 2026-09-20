/**
 * Plans the suite provisions ahead of time.
 *
 * `welcome-paywall.spec.ts` drives a real Stripe Checkout, so its plan's Stripe
 * price has to be synced and active *before* the test clicks "Select". A plan
 * created inside the test races bridge-api's async price-sync/archive sweep
 * (`_getActiveStripePrice` → 500 "Cannot find a matching Stripe price").
 *
 * The key is therefore STABLE and the plan is created via `ensure-plan`
 * (create-if-absent) in `global-setup.ts`, once per worker app, and never
 * deleted — so on every run after the first it is simply reused, with no Stripe
 * work at all. Shared from here so the spec and the setup cannot drift apart.
 */
export const PAYWALL_PLAN = {
  key: 'e2e-paywall-pro',
  currency: 'USD',
  definition: {
    key: 'e2e-paywall-pro',
    name: 'Paywall Pro',
    description: 'Paid plan for welcome-paywall E2E (stable, reused across runs)',
    trial: false,
    trialDays: 0,
    prices: [{ amount: 2900, currency: 'USD', recurrenceInterval: 'month' }],
  },
};
