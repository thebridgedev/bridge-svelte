# How billing works

Bridge gives every workspace **one canonical subscription** — a plan, a status, and an optional trial — kept live in your app over the Bridge live channel. When a payment fails, a trial nears its end, or an admin changes the plan in Stripe, your UI reflects it within seconds, without polling.

## Why Bridge billing, not Stripe directly

You could integrate Stripe yourself. Bridge billing runs on top of Stripe and gives you the parts you'd otherwise have to build:

- **Your app never holds Stripe secrets or calls Stripe.** Bridge manages the connection, checkout, the customer portal, and webhooks server-side.
- **A plan → entitlement/quota model on top of raw Stripe prices.** Gate features and meter usage without building that layer yourself (see below).
- **Live subscription state, pushed to every client.** No polling and no webhook plumbing in your app — the workspace's plan/status arrives over the live channel and updates in place.
- **Drop-in UI.** Plan selector, paywall, billing notices, and quota banners instead of hand-building checkout and portal screens.
- **The messy lifecycle, handled.** Trials, dunning and failed-payment retries, cancellation, and reactivation — each surfaced as an event you can hook.
- **Per-workspace and backend-enforceable.** Billing is tied to the authenticated workspace, and entitlements/quotas can be enforced on your server from verified billing truth, not just in the browser.

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

## How to consume billing state

Read state from the **`bridge` surface** (`bridge.tenant.subscription`, `bridge.tenant.entitlements`) and use the **drop-in components** for UI. It's live, reactive, and needs zero wiring — this is what the rest of this section uses, and it's the path you should reach for.

**Read the subscription** to drive your own UI — the store updates in place when the plan or status changes:

```svelte
<script lang="ts">
  import { bridge } from '@nebulr-group/bridge-svelte';

  const subscription = bridge.tenant.subscription;
</script>

{#if $subscription?.status === 'active'}
  <a href="/subscription">Manage plan</a>
{:else}
  <a href="/subscription">Upgrade</a>
{/if}
```

**Read an entitlement** to gate a feature on what the plan grants (`can()` is synchronous and fail-closed — `false` until the snapshot lands):

```svelte
<script lang="ts">
  import { bridge } from '@nebulr-group/bridge-svelte';
</script>

{#if bridge.tenant.entitlements.can('ai_completions')}
  <AiPanel />
{/if}
```

**For UI, prefer a drop-in component** over wiring your own — each reads the same live state:

- [`<PlanSelector>`](/billing/onboarding/choose-switch-plans/) — plan cards + checkout/switch
- [`<BridgePaywall>`](/billing/onboarding/require-plan/) — gate the app until a plan is active
- [`<BridgeBillingNotice>`](/billing/status/billing-notices/) — trial/past-due/canceled banners
- [`<BridgeQuotaBanner>`](/billing/limits/usage-limits/) — usage-cap warnings for a metric
- [`<BridgeSubscriptionStatus>`](/billing/status/subscription-status/) — a compact plan + status badge

> **Tip:** Building a fully custom plan picker or checkout flow the drop-in components can't express? The lower-level subscription store and service methods they're built on are available — see [Use subscription management on its own](/billing/advanced/standalone/). Reach for it only then.

On the backend, read the same subscription state and entitlements over REST — see [Check plans on your backend](/billing/advanced/backend-checks/) and the [Subscriptions & Entitlements](/api-reference/subscriptions/) API reference.
