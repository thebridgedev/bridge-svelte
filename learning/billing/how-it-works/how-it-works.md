# How billing works

Bridge gives every workspace **one canonical subscription** — a plan, a status, and an optional trial — kept live in your app over the Bridge live channel. When a payment fails, a trial nears its end, or an admin changes the plan in Stripe, your UI reflects it within seconds, without polling.

## A plan grants two kinds of things

When a workspace is on a plan, that plan controls access in two distinct ways:

- **Entitlements — on/off capabilities.** *Does this plan include feature X?* A yes/no switch per feature (e.g. AI, SSO, advanced reports). There's no "amount" — you either have it or you don't. → [Lock features to a plan](/billing/limits/lock-features/)
- **Quotas — usage allowances.** *How much of X can they use?* A counter with a limit (e.g. 10,000 AI calls/month, 20 seats). You can be entitled to a feature and still run out of it. → [Set usage limits](/billing/limits/usage-limits/)

| | Entitlement | Quota |
|---|---|---|
| Question | Can they use it at all? | How much is left? |
| Shape | boolean (yes/no) | number (used / limit) |
| Runs out? | No | Yes |

> Entitlements and quotas are **billing-derived** (what the plan grants the workspace). They are not roles — use Bridge's role & privilege system for who-may-do-what inside a workspace.

## Subscription state is live

The unified `bridge` surface exposes the workspace's canonical subscription as a reactive store. It is populated by the `session.snapshot` event when the live channel connects (and on every reconnect), then updated by live pushes:

```svelte
<script lang="ts">
  import { bridge } from '@nebulr-group/bridge-svelte';

  const subscription = bridge.tenant.subscription;
</script>

{#if $subscription}
  <p>Plan: {$subscription.plan.name} ({$subscription.status})</p>
  {#if $subscription.endsAt}
    <p>Renews / ends: {new Date($subscription.endsAt).toLocaleDateString()}</p>
  {/if}
{/if}
```

Snapshot shape:

```ts
interface SubscriptionSnapshot {
  plan: { slug: string; name: string };
  status: string;        // "trial" | "active" | "past_due" | "cancel_at_period_end" | "canceled"
  endsAt?: string;       // trial end or cancellation date, when applicable
  gateEngaged?: boolean; // true when the workspace is billing-locked
}
```

The store is `null` until the channel delivers the first snapshot — gate on it for a skeleton state, exactly like the example above.

## Two ways to consume billing state

1. **The `bridge` surface + drop-in components** (recommended) — live, reactive, zero wiring. This is what the rest of this section uses.
2. **The classic store + service methods** — the original checkout flow, still fully supported. → [Use subscription management on its own](/billing/advanced/standalone/)
