# Handle failed payments

When a renewal payment fails, Bridge moves the subscription of the workspace
(called a *tenant* in the API) to `status: "past_due"` and starts **dunning**
(automated payment retries). All of this arrives live on the `bridge` object;
you don't poll Stripe.

## Surfacing it to users

`<BridgeBillingNotice />` is built for this: it renders a past-due / payment-problem
banner with an action to fix the card, and clears itself automatically once the
payment recovers. See [Warn about billing problems](/billing/status/billing-notices/).

## Reacting to payment & dunning events

For alerts, audit logs, or ops notifications, handle the payment and dunning
event kinds (`payment.failed`, `payment.succeeded`, `dunning.entered`,
`dunning.retry_scheduled`, `dunning.recovered`, `dunning.exhausted`) on the
unified dispatcher. [React to billing changes](/billing/lifecycle/billing-events/)
is the full kind and payload reference; a minimal example:

```ts
import { bridge } from '@nebulr-group/bridge-svelte';

bridge.events.handle({
  'payment.failed':    (m) => alertOps(`Payment failed (card ••••${m.cardLast4})`),
  'dunning.exhausted': (m) => analytics.track('dunning_exhausted', m),
});
```

## If dunning runs out

If every retry fails, the subscription is ultimately canceled and the workspace
becomes **billing-locked**: the server sets `gateEngaged: true` on the
subscription snapshot. This is the same lock mechanism described in
[How billing works](/billing/how-it-works/#when-billing-locks-the-app).
Gate the app with [Require a plan](/billing/onboarding/require-plan/) so the
workspace can re-subscribe, or use `<BridgeBillingNotice mode="hard" />` for a
lockscreen with a recovery CTA.
