# Choose & switch plans

This is the self-service billing page most apps need: one place where a user picks their first plan, upgrades, downgrades, or switches billing interval. `<PlanSelector>` is the whole thing in one component. Unlike [`<BridgePaywall>`](/billing/onboarding/require-plan/), which *forces* a choice before the app loads, this is the always-available page a user visits when they choose to.

Drop `<PlanSelector>` onto your subscription page. It loads the plans and the status of the current workspace (called a *tenant* in the API) automatically, renders plan cards, and handles free plan selection, Stripe Checkout, and plan changes.

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
| `onSelect` | `({ plan, price }) => void` | (none) | Called after a free plan is selected or a plan change completes |
| `planCard` | `Snippet<[{ plan, prices, isCurrent, onPick }]>` | (none) | Override the default plan card layout |
| `emptyState` | `Snippet` | (none) | Override the "no plans" message |
| `loadingState` | `Snippet` | (none) | Override the loading spinner |

All standard `HTMLAttributes<HTMLDivElement>` props (`class`, `style`, `data-*`, etc.) are forwarded to the root element.

**Custom plan card:**

The default plan cards are intentionally plain. If you want them to match your product's design, pass a **`planCard` snippet** and render the cards yourself. You get the plan data and a ready-made pick handler, and Bridge still owns the free-select / checkout / change branching. You only write markup; you never touch the SDK. Here's an example:

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

The snippet is called once per plan and receives four parameters:

| Parameter | Type | What it's for |
|-----------|------|---------------|
| `plan` | `Plan` | The plan to render: `key`, `name`, `description`, `trial`, `trialDays`, etc. |
| `prices` | `PriceOfferSdk[]` | The plan's price offers (`amount`, `currency`, `recurrenceInterval`); one button per price is the usual layout |
| `isCurrent` | `boolean` | `true` when this is the workspace's current plan; use it to highlight the card and disable its buttons |
| `onPick` | `(price: PriceOfferSdk) => void` | The pick handler; call it with the chosen price when the user clicks |

All you have to wire is calling **`onPick(price)`**; the component figures out whether that's a free selection, a paid checkout, or a plan change. Under the hood, `onPick(price)` branches on the price and the workspace's payment state:

- `price.amount === 0` → calls `selectFreePlan`, refreshes the store
- paid + `paymentsEnabled` → calls `changePlan`, refreshes the store
- paid + no payment method yet → calls `startCheckout`, launches Stripe Checkout

> **Tip:** Keep your snippet purely presentational. Don't call `selectFreePlan`, `changePlan`, or `startCheckout` yourself: `onPick` already routes to the right one, and calling `onSelect` on the `<PlanSelector>` is how you react after a free selection or plan change completes.

**Data attributes for CSS styling:**

| Attribute | Values | When set |
|-----------|--------|----------|
| `data-bridge-plan-selector` | (no value) | Always present on root |
| `data-loading` | `"true"` / `"false"` | Loading + in-flight pick state |
| `data-state` | `"idle"` `"select-plan"` `"active"` `"trial"` `"payment-failed"` `"setup-payments"` | Current status |
| `data-bridge-plan-card` | (no value) | On each plan card |
| `data-current` | `"true"` / `"false"` | Whether this card is the current plan |
| `data-trial` | `"true"` / `"false"` | Whether this plan has a trial |
