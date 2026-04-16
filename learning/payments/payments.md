# Payments & Subscriptions

Bridge provides a direct-API subscription system. Users pick a plan, pay via Stripe Checkout (if applicable), and return to your app. All subscription state is managed in a reactive Svelte store.

### PlanSelector component

Drop `<PlanSelector>` onto your subscription page. It loads plans and status automatically, renders plan cards, and handles free plan selection, Stripe Checkout, and plan changes.

```svelte
<!-- src/routes/subscription/+page.svelte -->
<script lang="ts">
  import { PlanSelector, loadSubscription } from '@nebulr-group/bridge-svelte';
  import { onMount } from 'svelte';

  onMount(() => loadSubscription());
</script>

<PlanSelector
  successUrl="https://yourapp.com/subscription/success"
  cancelUrl="https://yourapp.com/subscription/cancel"
/>
```

**Props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `successUrl` | `string` | yes | Stripe redirects here after successful payment |
| `cancelUrl` | `string` | yes | Stripe redirects here if the user cancels checkout |
| `onSelect` | `() => void` | no | Called after a free plan is selected or a plan change completes |
| `planCard` | `Snippet<[{ plan, prices, isCurrent, onPick }]>` | no | Override the default plan card layout |
| `emptyState` | `Snippet` | no | Override the "no plans" message |
| `loadingState` | `Snippet` | no | Override the loading spinner |

All standard `HTMLAttributes<HTMLDivElement>` props (`class`, `style`, `data-*`, etc.) are forwarded to the root element.

**Custom plan card:**

```svelte
<script lang="ts">
  import { PlanSelector, loadSubscription, type Plan, type PriceOfferSdk } from '@nebulr-group/bridge-svelte';
  import { onMount } from 'svelte';

  onMount(() => loadSubscription());
</script>

<PlanSelector
  successUrl="/subscription/success"
  cancelUrl="/subscription/cancel"
>
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

### Subscription state store

`subscriptionStore` is a readable Svelte store that holds the subscription state. Call `loadSubscription()` to populate it.

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

### Stripe redirect pages

Create two lightweight routes that Stripe redirects back to:

```svelte
<!-- src/routes/subscription/success/+page.svelte -->
<script lang="ts">
  import { loadSubscription } from '@nebulr-group/bridge-svelte';
  import { onMount } from 'svelte';

  onMount(() => loadSubscription());
</script>

<h1>Payment successful!</h1>
<p>Your subscription is now active.</p>
<a href="/">Back to home</a>
```

```svelte
<!-- src/routes/subscription/cancel/+page.svelte -->
<h1>Payment cancelled</h1>
<p>No charges were made.</p>
<a href="/subscription">Back to plans</a>
```

### Individual service methods

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

### Billing portal

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

### Subscription state reference

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
shouldSelectPlan    → show plan picker
paymentFailed       → show error banner + "Manage billing" + plan cards (to switch)
shouldSetupPayments → send user through startCheckout again
trial / active      → show plan cards in "change" mode (current plan highlighted)
```
