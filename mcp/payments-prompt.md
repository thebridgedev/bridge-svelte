# Bridge SvelteKit — Payments & Subscriptions

You are adding subscription plan management to a SvelteKit application that uses The Bridge.

## Prerequisites check

Before starting, verify that Bridge is set up in this project:
1. `@nebulr-group/bridge-svelte` is in package.json dependencies
2. `src/routes/+layout.ts` calls `bridgeBootstrap()` with a `BridgeConfig` and `RouteGuardConfig`
3. `src/routes/+layout.svelte` renders `<BridgeBootstrap>`
4. `VITE_BRIDGE_APP_ID` is set in `.env`

If any are missing, run `bridge guide svelte` first to complete the initial setup.

## Install Stripe (if using paid plans)

Only needed if plans have non-zero prices:

```bash
{pm} add @stripe/stripe-js
```

Replace `{pm}` with the project's package manager (`bun add`, `pnpm add`, `yarn add`, or `npm i`).

Free-only plans do not require Stripe.

## Create a subscription page

Create `src/routes/subscription/+page.svelte` with the `PlanSelector` component. It loads plans and status automatically, renders plan cards, and handles free plan selection, Stripe Checkout, and plan changes:

```svelte
<!-- src/routes/subscription/+page.svelte -->
<script lang="ts">
  import { PlanSelector, loadSubscription } from '@nebulr-group/bridge-svelte';
  import { onMount } from 'svelte';

  onMount(() => loadSubscription());
</script>

<h1>Choose a plan</h1>

<PlanSelector
  successUrl="{origin}/subscription/success"
  cancelUrl="{origin}/subscription/cancel"
/>
```

Replace `{origin}` with the app's actual origin (e.g., `http://localhost:3000` for local dev, or a production domain).

**PlanSelector props:**

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `successUrl` | `string` | yes | Stripe redirects here after successful payment |
| `cancelUrl` | `string` | yes | Stripe redirects here if the user cancels checkout |
| `onSelect` | `() => void` | no | Called after a free plan is selected or a plan change completes |
| `planCard` | `Snippet<[{ plan, prices, isCurrent, onPick }]>` | no | Override the default plan card layout |
| `emptyState` | `Snippet` | no | Override the "no plans" message |
| `loadingState` | `Snippet` | no | Override the loading spinner |

**Custom plan card (optional):**

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
- `price.amount === 0` -- calls `selectFreePlan`, refreshes the store
- paid + `paymentsEnabled` -- calls `changePlan`, refreshes the store
- paid + no payment method yet -- calls `startCheckout`, launches Stripe Checkout

## Create Stripe redirect pages

Create two lightweight routes that Stripe redirects back to after checkout:

**Success page** (`src/routes/subscription/success/+page.svelte`):

```svelte
<script lang="ts">
  import { loadSubscription } from '@nebulr-group/bridge-svelte';
  import { onMount } from 'svelte';

  onMount(() => loadSubscription());
</script>

<h1>Payment successful!</h1>
<p>Your subscription is now active.</p>
<a href="/">Back to home</a>
```

**Cancel page** (`src/routes/subscription/cancel/+page.svelte`):

```svelte
<h1>Payment cancelled</h1>
<p>No charges were made.</p>
<a href="/subscription">Back to plans</a>
```

## Using subscription state

`subscriptionStore` is a readable Svelte store that holds the subscription state. Call `loadSubscription()` to populate it:

```ts
import { subscriptionStore, loadSubscription } from '@nebulr-group/bridge-svelte';

// Trigger a fetch (e.g. on mount, after login, after Stripe redirect)
await loadSubscription();

// Read reactively
const { status, plans, loading, error } = $subscriptionStore;
```

**Store shape:**

```ts
interface SubscriptionState {
  status: SubscriptionStatus | null;  // null until first load
  plans:  Plan[] | null;              // null until first load
  loading: boolean;
  error:  string | null;
}
```

**Subscription status fields:**

| Field | Type | Meaning |
|-------|------|---------|
| `shouldSelectPlan` | `boolean` | No plan chosen yet -- show plan picker |
| `shouldSetupPayments` | `boolean` | Paid plan selected but checkout not completed |
| `paymentFailed` | `boolean` | Last Stripe invoice failed -- direct user to portal |
| `paymentsEnabled` | `boolean` | Active billing subscription |
| `trial` | `boolean` | Currently in trial period |
| `trialDaysLeft` | `number` | Days remaining in trial |
| `plan` | `Plan \| undefined` | Currently active plan (if any) |

**Decision tree for conditional UI:**

```
shouldSelectPlan    -> show plan picker
paymentFailed       -> show error banner + "Manage billing" + plan cards (to switch)
shouldSetupPayments -> send user through startCheckout again
trial / active      -> show plan cards in "change" mode (current plan highlighted)
```

## Custom plan UI (optional)

For custom UIs that do not use `<PlanSelector>`, call the service methods directly via `getBridgeAuth()`:

```ts
import { getBridgeAuth, loadSubscription } from '@nebulr-group/bridge-svelte';
```

**Fetch subscription status:**

```ts
const status = await getBridgeAuth().getSubscriptionStatus();
// status.shouldSelectPlan  -> show plan picker
// status.paymentFailed     -> show payment error + portal link
// status.trial             -> show trial countdown
// status.paymentsEnabled   -> billing is active
```

**Fetch all available plans:**

```ts
const plans = await getBridgeAuth().getPlans();
// plan.prices[n].amount === 0  -> free plan (no Stripe needed)
```

**Select a free plan:**

```ts
await getBridgeAuth().selectFreePlan('free');
await loadSubscription(); // refresh the store
```

**Start Stripe Checkout for a paid plan:**

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

**Change plan for an active subscriber:**

Requires `status.paymentsEnabled === true`. Use `startCheckout` for new subscribers.

```ts
await getBridgeAuth().changePlan('enterprise', {
  amount: 9900,
  currency: 'usd',
  recurrenceInterval: 'month',
});
await loadSubscription();
```

## Billing portal

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

## Verify

1. Check that plans are configured in the Bridge dashboard (or via the CLI)
2. Navigate to `/subscription` -- plan cards should render
3. Select a free plan -- the subscription status should update to active
4. If Stripe is configured, select a paid plan and verify the Stripe Checkout redirect
5. After payment, confirm the success page loads and `loadSubscription()` reflects the new status
6. Test the billing portal button -- it should redirect to Stripe's portal
7. Run the project's build command to confirm no TypeScript or import errors
