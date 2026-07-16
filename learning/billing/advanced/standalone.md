# Use subscription management on its own

This is the **lower-level API** for building custom checkout UIs: the subscription store and service methods that `<PlanSelector>` and `<BridgePaywall>` are built on under the hood. Reach for it when you need a plan picker or checkout flow the drop-in components can't express; otherwise consume billing state from the `bridge` object as shown in [How billing works](/billing/how-it-works/).

## Subscription state store

`subscriptionStore` is a readable Svelte store that holds the checkout-flow state. Call `loadSubscription()` to populate it.

In a `.svelte` component, read it reactively with the `$` prefix:

```svelte
<script lang="ts">
  import { subscriptionStore, loadSubscription } from '@nebulr-group/bridge-svelte';

  // Trigger a fetch (e.g. on mount, after sign-in, after the Stripe redirect)
  loadSubscription();
</script>

{#if $subscriptionStore.loading}
  <p>Loading plans…</p>
{:else if $subscriptionStore.status?.shouldSelectPlan}
  <p>Pick a plan to continue.</p>
{/if}
```

In plain `.ts` code the `$` prefix isn't available (and destructuring a store isn't reactive); take a one-off imperative read with `get()`:

```ts
import { get } from 'svelte/store';
import { subscriptionStore, loadSubscription } from '@nebulr-group/bridge-svelte';

await loadSubscription();

const { status, plans, loading, error } = get(subscriptionStore);
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

## Individual service methods

For custom UIs that don't use `<PlanSelector>`, call the service methods directly:

```ts
import { getBridgeAuth, loadSubscription } from '@nebulr-group/bridge-svelte';
```

**`getSubscriptionStatus()`**: fetch the subscription status of the current workspace (called a *tenant* in the API):

```ts
const status = await getBridgeAuth().getSubscriptionStatus();
// status.shouldSelectPlan  → show plan picker
// status.paymentFailed     → show payment error + portal link
// status.trial             → show trial countdown
// status.paymentsEnabled   → billing is active
```

**`getPlans()`**: fetch all available plans:

```ts
const plans = await getBridgeAuth().getPlans();
// plan.prices[n].amount === 0  → free plan (no Stripe needed)
```

The plan catalog is also available on the `bridge` object as `await bridge.app.plans` (fetched on first access and cached).

**`selectFreePlan(planKey)`**: immediately activate a free plan:

```ts
await getBridgeAuth().selectFreePlan('free');
await loadSubscription(); // refresh the store
```

**`startCheckout(planKey, priceOffer, options)`**: create a Stripe Checkout session and redirect. Pass one of the plan's price offers (from `getPlans()`):

```ts
const plans = await getBridgeAuth().getPlans();
const pro = plans.find((p) => p.key === 'pro')!;
const monthly = pro.prices.find((pr) => pr.recurrenceInterval === 'month')!;

const session = await getBridgeAuth().startCheckout('pro', monthly, {
  successUrl: 'https://yourapp.com/subscription/success',
  cancelUrl: 'https://yourapp.com/subscription/cancel',
});

if (session.sessionId === null) {
  // Stripe isn't configured on this app; the plan was set directly
  await loadSubscription();
} else {
  window.location.href = session.checkoutUrl!;
}
```

Relative `successUrl` / `cancelUrl` paths are resolved against the current origin, so `/subscription/success` works too.

**`changePlan(planKey, priceOffer)`**: switch an active subscriber to a different plan:

> Requires `status.paymentsEnabled === true`. Use `startCheckout` for new subscribers.

```ts
const enterprise = plans.find((p) => p.key === 'enterprise')!;
await getBridgeAuth().changePlan('enterprise', enterprise.prices[0]);
await loadSubscription();
```

## Subscription state reference

| `SubscriptionStatus` field | Type | Meaning |
|----------------------------|------|---------|
| `shouldSelectPlan` | `boolean` | No plan chosen yet: show the plan picker |
| `shouldSetupPayments` | `boolean` | Paid plan selected but checkout not completed |
| `paymentFailed` | `boolean` | Last Stripe invoice failed: direct the user to the portal |
| `paymentsEnabled` | `boolean` | Active billing subscription |
| `paymentsAutoRedirect` | `boolean` | When `false`, the workspace has opted out of the platform's native plan-selection gate |
| `trial` | `boolean` | Currently in trial period |
| `plan` | `Plan \| string \| undefined` | Current plan. The REST endpoint returns the full `Plan` object; JWT-derived paths return the plan key as a string |

Decision tree:

```
shouldSelectPlan    → show plan picker (or just use <BridgePaywall>)
paymentFailed       → show error banner + "Manage billing" + plan cards (to switch)
shouldSetupPayments → send user through startCheckout again
trial / active      → show plan cards in "change" mode (current plan highlighted)
```
