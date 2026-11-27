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
| `/subscription/error` | Where a failed checkout lands |
| `/subscription/success` | Where checkouts of earlier versions returned. It goes on to `/subscription`, so old links keep working |

Every page has a "Back" link to your app, to `/` unless you say otherwise: `billing: { back: '/dashboard' }`, or `billing: { back: false }` for none (or `<BridgeBillingRoutes back="/dashboard" />`).

Move the pages with `billing: { base: '/billing' }`, move the paywall with `billing: { paywall: '/welcome' }`, or turn it off with `billing: { paywall: false }`. `frame` and `heading` snippets work as on the sign-in pages.

### What the subscription page shows while a plan changes

The current-plan box says what is on its way, and keeps saying it until it happens:

- **A downgrade** waits for the end of the period: "Pro until 24 Dec 2026, then Free", with a "Keep Pro" button that takes the change back. The Free card says when it starts.
- **An upgrade** waits for its payment: "Upgrading to Mega… confirming your payment" with a spinner, until the payment is confirmed (then "You're on Mega now"). If the bank needs the payer to confirm, or the payment fails, it says so and gives one button, "Confirm payment" or "Update card".

None of this is a message that goes away. `<CurrentPlan>` is the box, if you build the page yourself.

## Checkout

Choosing a paid plan without a card on file sends the person to Stripe's checkout. The plugin tells Bridge to bring them back to your subscription page (`/subscription`, or your `billing.base`). Bridge accepts that only on one of the app's registered browser addresses, which any app already has since its pages call Bridge from there. When they come back, `<CheckoutNotice>` (on the subscription page already) confirms the checkout with Bridge once, shows "You're on Pro now" (the same banner the Free plan gives), and clears the checkout details from the address. Put it on any page your checkout returns to.

A return address set in the dashboard under Subscription Control overrides the plugin's.

If the checkout cannot start because of how the app is set up (the page's address is not a registered browser address, or Bridge was told no return address), the person sees "Changing the plan is not available right now. Please try again later or contact support.", and you get the exact words with the fix in the browser console (`[bridge] The checkout could not start. …`) and in the app's log in the dashboard.

## The pieces

| Component | Shows |
|---|---|
| `PlanPicker` | The plans on offer, with prices per interval and the current plan marked. Choosing needs `bridge-billing-manage`; others see who to ask |
| `BillingPortalButton` | Opens Stripe's billing portal. Shown only with `bridge-billing-manage` |
| `SubscriptionStatus` | The plan's name and its status |
| `CurrentPlan` | The current-plan box: the plan, its renewal or end, and a downgrade or upgrade on its way |
| `BillingNotice` | The one notice worth showing now: blocked, payment due, needs a plan, trial ending, ending, or a change waiting. `mode="hard"` covers the page while the workspace is locked for payment |
| `QuotaBanner` | A limit nearing (from 80%) or reached, for one metric (`<QuotaBanner metric="tickets" />`); a metered limit shows its overage |
| `QuotaGate` | Disables the actions inside once a metric is at its hard limit, with an upgrade line beside them |
| `CheckoutNotice` | The outcome of a checkout the person came back from |

`billing`, `plans` and `usage` are the stores behind them, as `{ value, loading, error }`.

### Your own display

`useQuota('tickets')` gives one metric's numbers, live: they move by themselves when usage or the plan changes.

```svelte
<script lang="ts">
  import { useQuota } from '@nebulr-group/bridge-svelte';
  const tickets = useQuota('tickets');
</script>

{#if tickets.loading}…{:else if tickets.unlimited}Unlimited{:else}{tickets.used} of {tickets.limit}{/if}
```

It has `loading`, `unlimited`, `used`, `limit`, `remaining`, `warningLevel` (`approaching` from 80%, `critical` from 95%), `kind` (`counter` or `gauge`) and the whole `snapshot` (with `policy`, `hard` or `metered`). There is never a made-up 0: while loading the numbers are `null`. It is also a store, `$tickets`, with `{ used, limit, ratio, state }`, or `null` while loading and for a metric without a limit.

Whether the plan has a feature is a flag: rule a flag `bridge:billing.entitlement.analytics eq true` and gate the page or the button with `<FeatureFlag>` or a route rule (see [Flags and route guards](../flags/flags.md)), never by reading the plan in the page.

```svelte
<QuotaGate metric="tickets">
  <button onclick={createTicket}>New ticket</button>
  {#snippet atLimit(quota)}{quota.used} of {quota.limit} used. <a href="/subscription">Upgrade</a>{/snippet}
</QuotaGate>
```

The gate and the banner show where the workspace stands; your server enforces the limit and refuses the write. They never disable on "not known yet", for a metric without a limit, or for a metered limit, which bills the overage instead of blocking.

## Plan limits

Bridge counts usage and enforces limits; your server counts with `meter()` (see [Your server](../server/server.md)). When your API refuses a request at a limit with a 402, call it through `bridgeFetch` and the upgrade dialog opens by itself:

```ts
import { bridgeFetch } from '@nebulr-group/bridge-svelte';

const response = await bridgeFetch('/api/tickets', { method: 'POST' });
```

The dialog opens for a 402 that says a limit was reached (`{ code: 'QUOTA_EXCEEDED', metric, used, limit }`, or problem details of type `quota-exceeded`) or a plan feature is missing (`{ code: 'FEATURE_NOT_IN_PLAN', flag, feature }` from `@nebulr-group/bridge-nestjs`, or problem details of type `plan-required` with `entitlement`). Any other 402, such as a declined card, leaves it shut, and so does a 402 that came through a redirect or from a host other than your page, your `tokenOrigins` or Bridge. A link in the refusal is followed only when it is a path on your site. Run your own code for each refused limit with `onBridgeQuotaExceeded((refusal) => …)`. Open the dialog yourself with `openUpgrade({ kind: 'feature', entitlement })`, replace it with `billing: { upgradeDialog: MyDialog }`, or turn it off with `false`.

`bridgeFetch` adds the person's token and refreshes it once after a 401. It sends the token only to your page's own origin, Bridge, and the origins you list:

```ts
bridgeBootstrap({ tokenOrigins: ['https://api.example.com'] });
```

## A workspace locked for payment

When the payment provider has given up collecting, the workspace is locked: people can read, nothing can be changed. `<BillingNotice />` shows it to every person, not only the owner, and `<BillingNotice mode="hard" />` covers the page with a blocking screen that the owner can leave through the billing page. `$billingGate` is the lock as a store, `{ locked, severity, noticeState, recoveryUrl }`, and `$billingLocked` is its yes or no. It is read when the page starts and again when Bridge says billing access changed. When your API refuses a change with the lock's 402 (`BILLING_GATE_ENGAGED`) through `bridgeFetch`, the lock shows at once and the upgrade dialog stays shut: a locked workspace needs to pay, not to pick a plan.

To run code when a metric's numbers change, use the client: `getBridge().handle({ 'quota.updated': (update) => … })` runs once for each metric whose numbers changed, and returns how to stop.
