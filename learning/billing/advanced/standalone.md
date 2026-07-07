# Use subscription management on its own

The original checkout flow — plan picker, Stripe Checkout, billing portal — remains fully supported and is what `<PlanSelector>` and `<BridgePaywall>` use under the hood.

## Subscription state store

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

## Individual service methods

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

## Subscription state reference

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
