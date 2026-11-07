# Billing

The plugin shows your plans, sends people to Stripe's checkout, brings them back, opens the billing portal, and tells them about trials, failed payments and plan limits. Bridge keeps the subscription; your app never handles a card.

Who may change the plan is a flag, `bridge-billing-manage`. Whether the workspace may use the app at all is a flag too, `bridge-app-active`: while it is off, signed-in people are sent to the plan page (the paywall). The billing facts (plan name, trial end, usage) are for showing only, never for gating: gate a feature on a flag whose rule names the plan feature (see [Flags and route guards](../flags/flags.md)).

## The billing pages

```svelte
<!-- src/routes/subscription/[...bridge]/+page.svelte -->
<script lang="ts">
  import { BridgeBillingRoutes } from '@nebulr-group/bridge-svelte';
</script>

<BridgeBillingRoutes />
```

| Page | What it does |
|---|---|
| `/subscription` | The current plan, the billing portal button, and changing plan |
| `/subscription/plan` | Picking a plan to start: the paywall page. Once a plan is active, the person goes back to where they were |
| `/subscription/success`, `/subscription/error` | After a checkout |

Move them with `billing: { base: '/billing' }`, move the paywall with `billing: { paywall: '/welcome' }`, or turn it off with `billing: { paywall: false }`. `frame` and `heading` snippets work as on the sign-in pages.

## Checkout

Choosing a paid plan without a card on file sends the person to Stripe's checkout. When they come back, `<CheckoutNotice>` (on the subscription page already) confirms the checkout with Bridge once, shows the outcome, and clears the checkout details from the address. Put it on any page your checkout returns to.

## The pieces

| Component | Shows |
|---|---|
| `PlanPicker` | The plans on offer, with prices per interval and the current plan marked. Choosing needs `bridge-billing-manage`; others see who to ask |
| `BillingPortalButton` | Opens Stripe's billing portal. Shown only with `bridge-billing-manage` |
| `SubscriptionStatus` | The plan's name and its status |
| `BillingNotice` | The one notice worth showing now: blocked, payment due, needs a plan, trial ending, ending, or a change waiting |
| `QuotaBanner` | A limit nearing or reached, for one metric (`<QuotaBanner metric="tickets" />`) |
| `CheckoutNotice` | The outcome of a checkout the person came back from |

`billing`, `plans` and `usage` are the stores behind them, as `{ value, loading, error }`. `useQuota('tickets')` gives `{ used, limit, ratio, state }` for your own display.

## Plan limits

Bridge counts usage and enforces limits; your server counts with `meter()` (see [Your server](../server/server.md)). When your API refuses a request at a limit with a 402, call it through `bridgeFetch` and the upgrade dialog opens by itself:

```ts
import { bridgeFetch } from '@nebulr-group/bridge-svelte';

const response = await bridgeFetch('/api/tickets', { method: 'POST' });
```

The dialog opens for a 402 that says a limit was reached (`{ code: 'QUOTA_EXCEEDED', metric, used, limit }`, or problem details of type `quota-exceeded`) or a plan feature is missing (`plan-required`, with `entitlement`). Any other 402, such as a declined card, leaves it shut, and so does a 402 that came through a redirect or from a host other than your page, your `tokenOrigins` or Bridge. A link in the refusal is followed only when it is a path on your site. Open it yourself with `openUpgrade({ kind: 'feature', entitlement })`, replace it with `billing: { upgradeDialog: MyDialog }`, or turn it off with `false`.

`bridgeFetch` adds the person's token and refreshes it once after a 401. It sends the token only to your page's own origin, Bridge, and the origins you list:

```ts
bridgeBootstrap({ tokenOrigins: ['https://api.example.com'] });
```
