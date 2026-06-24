---
title: Payments & Subscriptions
order: 60
oneLiner: One canonical subscription per workspace — plans, checkout, quotas & entitlements, all live.
related: [feature-flags, multi-tenancy]
---

# Payments & Subscriptions

Bridge gives every workspace one canonical subscription — a plan, a status, and an optional trial — kept live in your app over the Bridge live channel. When a payment fails, a trial nears its end, or an admin changes the plan in Stripe, your UI reflects it within seconds, without polling.

There are two ways to consume billing state:

1. **The `bridge` surface + drop-in components** (recommended) — live, reactive, zero wiring.
2. **The classic store + service methods** — the original checkout flow. Still fully supported; see [Classic checkout & subscription store](#classic-checkout--subscription-store) below.

### Live subscription state

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

### Drop-in components

#### `<BridgeSubscriptionStatus />`

Renders the current plan name + a status badge. Mounts and subscribes itself — no props required.

```svelte
<script lang="ts">
  import { BridgeSubscriptionStatus } from '@nebulr-group/bridge-svelte';
</script>

<BridgeSubscriptionStatus />
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `class` | `string` | `''` | Class applied to the root span |

#### `<BridgeBillingNotice />`

The unified billing banner. Renders **nothing** while the subscription is healthy, and the right notice when it needs attention — trial countdown, payment failed, dunning retries, cancellation, locked. Not dismissible; it disappears when the status flips back to healthy.

```svelte
<script lang="ts">
  import { BridgeBillingNotice } from '@nebulr-group/bridge-svelte';
</script>

<!-- Put it once in your root layout -->
<BridgeBillingNotice />
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `chassis` | `'bar' \| 'rail' \| 'card'` | `'rail'` | Visual variant |
| `mode` | `'soft' \| 'hard'` | `'soft'` | `soft` always renders inline; `hard` renders a full-screen lockscreen when the workspace is billing-locked |
| `class` | `string` | `''` | Class applied to the root element |
| `onActionClick` | `(state) => void` | — | Override the default CTA click handler |

States it covers: trial active, trial ending soon, past due, cancellation scheduled, canceled, dunning retry scheduled, final retry, exhausted (locked). Each state has two role variants: workspace admins get an action CTA ("Update card", "Upgrade"); members get an informational variant pointing them to their workspace owner.

#### `<BridgeQuotaBanner />`

A live usage-cap banner for one metric. Renders nothing while usage is below 80% of the plan's quota (or when the plan has no quota for that metric); shows a warning at 80–94%, critical at 95%+, and over-cap copy when the limit is exceeded. Updates live on `quota.updated` pushes.

```svelte
<script lang="ts">
  import { BridgeQuotaBanner } from '@nebulr-group/bridge-svelte';
</script>

<BridgeQuotaBanner metric="ai_completions" />
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `metric` | `string` | required | Metric key to watch |
| `label` | `string` | metric key | Humanized display label |
| `class` | `string` | `''` | Class applied to the root element |
| `onActionClick` | `(snap) => void` | — | Override the default Upgrade CTA handler |

For a fully custom quota UI, read the underlying snapshot directly:

```ts
import { useBridge } from '@nebulr-group/bridge-auth-core';

const q = useBridge().quota('ai_completions');
// q?.used, q?.limit, q?.remaining, q?.warningLevel ('approaching' | 'critical' | null)
```

#### `<BridgePaywall />`

A hard gate for workspaces that haven't picked a plan yet. While `shouldSelectPlan` is true it renders a full-screen modal with a `<PlanSelector>` inside; otherwise it renders its children.

```svelte
<script lang="ts">
  import { BridgePaywall } from '@nebulr-group/bridge-svelte';
</script>

<BridgePaywall successRedirect="/welcome" cancelRedirect="/plans">
  <!-- your app — only rendered once a plan is active -->
  <slot />
</BridgePaywall>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `successRedirect` | `string` | `'/'` | Where to send the user after a successful Stripe payment |
| `cancelRedirect` | `string` | `'/'` | Where to send the user if they cancel checkout |
| `onSelect` | `({ plan, price }) => void` | — | Called after free-plan selection or a direct plan change |
| `heading` | `Snippet` | "Choose a plan" | Override the modal heading |

Workspaces with `paymentsAutoRedirect: false` are exempt from the gate.

### Entitlements

Plans grant **entitlements** — named capabilities like `ai_completions` or `sso`. They arrive with the session snapshot and are replaced wholesale on every `entitlements.changed` push, so an upgrade unlocks features live.

```svelte
<script lang="ts">
  import { bridge } from '@nebulr-group/bridge-svelte';

  const entitlements = bridge.tenant.entitlements.snapshot;
</script>

{#if $entitlements?.ai_completions}
  <AiPanel />
{/if}
```

Imperative check (synchronous, fail-closed — `false` until the snapshot lands):

```ts
if (bridge.tenant.entitlements.can('ai_completions')) { /* ... */ }
```

**The recommended gating pattern is a feature flag**, not a raw conditional. Create a flag (e.g. `use_ai`) with a rule targeting `bridge:billing.entitlement.ai_completions`, then gate on the flag:

```svelte
<script lang="ts">
  import { useFlag } from '@nebulr-group/bridge-svelte/flags';

  const useAi = useFlag('use_ai', false);
</script>

{#if useAi.value}<AiPanel />{/if}
```

This gives you everything flags give you on top of the entitlement — percentage rollouts within a plan, kill switches, per-segment overrides — without code changes. The raw `entitlements.can()` conditional is the right tool when you aren't using feature flags. See the Feature Flags guide for the full list of `bridge:billing.*` targeting attributes (plan, subscription status, quotas, entitlements).

> Entitlements are **billing-derived** (what the plan grants the workspace). They are not roles — use Bridge's role/privilege system for who-may-do-what inside a workspace.

### Billing events

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

### Classic checkout & subscription store

The original checkout flow — plan picker, Stripe Checkout, billing portal — remains fully supported and is what `<PlanSelector>` and `<BridgePaywall>` use under the hood.

#### PlanSelector component

Drop `<PlanSelector>` onto your subscription page. It loads plans and status automatically, renders plan cards, and handles free plan selection, Stripe Checkout, and plan changes.

```svelte
<!-- src/routes/subscription/+page.svelte -->
<script lang="ts">
  import { PlanSelector } from '@nebulr-group/bridge-svelte';
</script>

<PlanSelector successRedirect="/subscription/success" cancelRedirect="/subscription/cancel" />
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `successRedirect` | `string` | `'/subscription'` | In-app route to land on after successful payment |
| `cancelRedirect` | `string` | `'/subscription'` | In-app route to land on if the user cancels checkout |
| `onSelect` | `({ plan, price }) => void` | — | Called after a free plan is selected or a plan change completes |
| `planCard` | `Snippet<[{ plan, prices, isCurrent, onPick }]>` | — | Override the default plan card layout |
| `emptyState` | `Snippet` | — | Override the "no plans" message |
| `loadingState` | `Snippet` | — | Override the loading spinner |

All standard `HTMLAttributes<HTMLDivElement>` props (`class`, `style`, `data-*`, etc.) are forwarded to the root element.

**Custom plan card:**

```svelte
<script lang="ts">
  import { PlanSelector, type Plan, type PriceOfferSdk } from '@nebulr-group/bridge-svelte';
</script>

<PlanSelector successRedirect="/subscription/success" cancelRedirect="/subscription/cancel">
  {#snippet planCard({ plan, prices, isCurrent, onPick })}
    <div class="plan-card" class:current={isCurrent}>
      <h2>{plan.name}</h2>
      {#if plan.trial}
        <span class="badge">Free {plan.trialDays}-day trial</span>
      {/if}
      {#each prices as price}
        <button disabled={isCurrent} onclick={() => onPick(price)}>
          {price.amount === 0 ? 'Free' : `${price.amount} ${price.currency.toUpperCase()} / ${price.recurrenceInterval}`}
        </button>
      {/each}
    </div>
  {/snippet}
</PlanSelector>
```

The `onPick(price)` callback handles branching internally:
- `price.amount === 0` → calls `selectFreePlan`, refreshes the store
- paid + `paymentsEnabled` → calls `changePlan`, refreshes the store
- paid + no payment method yet → calls `startCheckout`, launches Stripe Checkout

**Data attributes for CSS styling:**

| Attribute | Values | When set |
|-----------|--------|----------|
| `data-bridge-plan-selector` | — | Always present on root |
| `data-loading` | `"true"` / `"false"` | Loading + in-flight pick state |
| `data-state` | `"idle"` `"select-plan"` `"active"` `"trial"` `"payment-failed"` `"setup-payments"` | Current status |
| `data-bridge-plan-card` | — | On each plan card |
| `data-current` | `"true"` / `"false"` | Whether this card is the current plan |
| `data-trial` | `"true"` / `"false"` | Whether this plan has a trial |

#### Subscription state store

`subscriptionStore` is a readable Svelte store that holds the checkout-flow state. Call `loadSubscription()` to populate it.

```ts
import { subscriptionStore, loadSubscription } from '@nebulr-group/bridge-svelte';

// Trigger a fetch (e.g. on mount, after login, after Stripe redirect)
await loadSubscription();

// Read reactively
const { status, plans, loading, error } = $subscriptionStore;
```

Store shape:

```ts
interface SubscriptionState {
  status: SubscriptionStatus | null;  // null until first load
  plans:  Plan[] | null;              // null until first load
  loading: boolean;
  error:  string | null;
}
```

`subscriptionStore` is shared across all components. Calling `loadSubscription()` once from a parent page is enough.

#### Individual service methods

For custom UIs that don't use `<PlanSelector>`, call the service methods directly:

```ts
import { getBridgeAuth, loadSubscription } from '@nebulr-group/bridge-svelte';
```

**`getSubscriptionStatus()`** — fetch the current tenant's subscription status:

```ts
const status = await getBridgeAuth().getSubscriptionStatus();
// status.shouldSelectPlan  → show plan picker
// status.paymentFailed     → show payment error + portal link
// status.trial             → show trial countdown
// status.paymentsEnabled   → billing is active
```

**`getPlans()`** — fetch all available plans:

```ts
const plans = await getBridgeAuth().getPlans();
// plan.prices[n].amount === 0  → free plan (no Stripe needed)
```

The plan catalog is also available as a lazy slice on the bridge surface: `await bridge.app.plans` (fetches on first access).

**`selectFreePlan(planKey)`** — immediately activate a free plan:

```ts
await getBridgeAuth().selectFreePlan('free');
await loadSubscription(); // refresh the store
```

**`startCheckout(planKey, priceOffer, options)`** — create a Stripe Checkout session and redirect:

```ts
import { loadStripe } from '@stripe/stripe-js';

const session = await getBridgeAuth().startCheckout(
  'pro',
  { amount: 2900, currency: 'usd', recurrenceInterval: 'month' },
  {
    successUrl: 'https://yourapp.com/subscription/success',
    cancelUrl: 'https://yourapp.com/subscription/cancel',
  }
);

const stripe = await loadStripe(session.publicKey);
await stripe!.redirectToCheckout({ sessionId: session.sessionId });
```

**`changePlan(planKey, priceOffer)`** — switch an active subscriber to a different plan:

> Requires `status.paymentsEnabled === true`. Use `startCheckout` for new subscribers.

```ts
await getBridgeAuth().changePlan('enterprise', {
  amount: 9900,
  currency: 'usd',
  recurrenceInterval: 'month',
});
await loadSubscription();
```

#### Billing portal

Send users to the Stripe billing portal to update their payment method, view invoices, or cancel:

```svelte
<script lang="ts">
  import { getBridgeAuth } from '@nebulr-group/bridge-svelte';

  async function openPortal() {
    const url = await getBridgeAuth().getPortalUrl();
    window.location.href = url;
  }
</script>

<button onclick={openPortal}>Manage billing</button>
```

#### Subscription state reference

| `SubscriptionStatus` field | Type | Meaning |
|----------------------------|------|---------|
| `shouldSelectPlan` | `boolean` | No plan chosen yet — show plan picker |
| `shouldSetupPayments` | `boolean` | Paid plan selected but checkout not completed |
| `paymentFailed` | `boolean` | Last Stripe invoice failed — direct user to portal |
| `paymentsEnabled` | `boolean` | Active billing subscription |
| `trial` | `boolean` | Currently in trial period |
| `trialDaysLeft` | `number` | Days remaining in trial |
| `plan` | `Plan \| undefined` | Currently active plan (if any) |

Decision tree:

```
shouldSelectPlan    → show plan picker (or just use <BridgePaywall>)
paymentFailed       → show error banner + "Manage billing" + plan cards (to switch)
shouldSetupPayments → send user through startCheckout again
trial / active      → show plan cards in "change" mode (current plan highlighted)
```
