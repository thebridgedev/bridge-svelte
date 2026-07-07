# React to billing changes

For side effects — analytics, audit logs, Slack alerts — register handlers on the unified events dispatcher. This is separate from UI rendering, which the components above own:

```ts
import { bridge } from '@nebulr-group/bridge-svelte';

const unsubscribe = bridge.events.handle({
  'subscription.plan_changed': (m) => analytics.track('plan_changed', m),
  'payment.failed':            (m) => alertOps(`Payment failed (card ••••${m.cardLast4})`),
  'quota.updated':             (m) => updateMeter(m.metric, m.remaining),
  'entitlements.changed':      (m) => analytics.track('entitlements', m),
});
```

Billing event kinds: `subscription.plan_changed`, `subscription.created` / `updated` / `canceled` / `reactivated`, `subscription.trial_started` / `trial_ending_soon` / `trial_converted` / `trial_expired`, `payment.succeeded` / `payment.failed`, `dunning.entered` / `retry_scheduled` / `recovered` / `exhausted`, `quota.updated`, `entitlements.changed`.

Multiple handlers can register for the same kind; one throwing handler never blocks the others.
