# React to billing changes

The drop-in components own UI rendering (see [How billing works](/billing/how-it-works/)). For side effects such as analytics, audit logs, or Slack alerts, register handlers on the unified events dispatcher instead:

```ts
import { bridge } from '@nebulr-group/bridge-svelte';

const unsubscribe = bridge.events.handle({
  'subscription.plan_changed': (m) => analytics.track('plan_changed', m),
  'payment.failed':            (m) => alertOps(`Payment failed (card ••••${m.cardLast4})`),
  'quota.updated':             (m) => updateMeter(m.metric, m.remaining),
  'entitlements.changed':      (m) => analytics.track('entitlements', m),
});
```

Multiple handlers can register for the same kind; one throwing handler never blocks the others. The returned function unsubscribes every handler you passed.

## Billing event kinds and payloads

Every event carries the `tenantId` of the workspace (called a *tenant* in the API) it applies to, plus an `effectiveAt` ISO timestamp.

**Lifecycle events** share one payload shape. Everything beyond `kind`, `tenantId`, and `effectiveAt` is optional and populated per kind, so read defensively:

```ts
{
  kind: string;                   // one of the lifecycle kinds below
  tenantId: string;
  effectiveAt: string;
  status?: string;                // subscription status after the event
  pastDueReason?: string | null;  // e.g. 'card_declined', 'trial_expired'
  cardLast4?: string;
  hasCardOnFile?: boolean;
  endsAt?: string;
  daysLeft?: number;
  nextRetryAt?: string;
  finalRetryAt?: string;
  gateEngaged?: boolean;          // true when the event billing-locks the workspace
}
```

Lifecycle kinds: `payment.succeeded` / `payment.failed`, `subscription.created` / `updated` / `canceled` / `reactivated`, `subscription.trial_started` / `trial_ending_soon` / `trial_converted` / `trial_expired`, and the dunning (automated payment retry) kinds `dunning.entered` / `retry_scheduled` / `recovered` / `exhausted`.

**`subscription.plan_changed`** carries the plan transition:

```ts
{
  kind: 'subscription.plan_changed';
  tenantId: string;
  from: { slug: string };
  to: { slug: string; name: string };
  status: string;
  effectiveAt: string;
}
```

**`quota.updated`** carries a live usage counter for one metric:

```ts
{
  kind: 'quota.updated';
  tenantId: string;
  effectiveAt: string;
  metric: string;
  used: number;
  limit: number;
  remaining: number;
  warningLevel: null | 'approaching' | 'critical'; // null = under 80% used
  policy?: 'hard' | 'metered';
  // For metered quotas only:
  unitAmount?: number;      // per-unit price
  currency?: string;
  overageEstimate?: number; // estimated overage cost this period
  overcap?: boolean;        // usage passed the included allotment
}
```

**`entitlements.changed`** carries the full replacement entitlement map:

```ts
{
  kind: 'entitlements.changed';
  tenantId: string;
  effectiveAt: string;
  entitlements: Record<string, boolean>;
}
```

The same dispatcher also carries non-billing kinds (`flag.updated`, `session.snapshot`, and friends) and a `'*'` catch-all handler that fires when no specific handler is registered for a kind.
