# Handle failed payments

When a renewal payment fails, Bridge moves the workspace's subscription to
`status: "past_due"` and starts its **dunning** flow (automatic retries). All of
this arrives live on the `bridge` surface — you don't poll Stripe.

## Surfacing it to users

`<BridgeBillingNotice />` is built for this: it renders a past-due / payment-problem
banner with an action to fix the card, and clears itself automatically once the
payment recovers. See [Warn about billing problems](/billing/status/billing-notices/).

## Reacting to payment & dunning events

For alerts, audit logs, or ops notifications, handle the events on the unified
dispatcher — see [React to billing changes](/billing/lifecycle/billing-events/):

```ts
import { bridge } from '@nebulr-group/bridge-svelte';

bridge.events.handle({
  'payment.failed':       (m) => alertOps(`Payment failed (card ••••${m.cardLast4})`),
  'dunning.entered':      (m) => analytics.track('dunning_entered', m),
  'dunning.retry_scheduled': (m) => log('retry scheduled', m),
  'dunning.recovered':    (m) => analytics.track('dunning_recovered', m),
  'dunning.exhausted':    (m) => analytics.track('dunning_exhausted', m),
});
```

If dunning is exhausted, the subscription is ultimately canceled and the
workspace becomes billing-locked — gate the app with
[Require a plan](/billing/onboarding/require-plan/) so they can re-subscribe.
