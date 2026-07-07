# Choose & switch plans

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
