# Bridge SvelteKit — Billing

You are wiring **billing UI** into a SvelteKit application that uses The Bridge. Plans and Stripe are already configured — this guide covers the frontend only: the subscription page, lifecycle notices, quota counters, and the billing portal.

> **STOP — do not install any packages.** The only dependency is `@nebulr-group/bridge-svelte`, which is already installed. Do NOT install `@stripe/stripe-js` — the SDK redirects to Stripe Checkout via a plain URL redirect, no Stripe client library needed. `@stripe/stripe-js` appears in the package peer dep list for legacy reasons and must not be installed.

## Prerequisites

Verify before starting:

```bash
bridge plan list
```

- At least one plan must be listed. If empty, run `bridge guide billing` (no `--framework`) first — the master prompt handles plan creation and Stripe setup, then comes back here.

```bash
bridge stripe status
```

- If any plan has a price, Stripe must be connected. If it isn't, `<PlanSelector>` will silently fail when a user picks a paid plan. Return to the master prompt (`bridge guide billing`) to connect Stripe before continuing. Free-only setups can skip this check.

- Bridge Auth must be set up in this project:
  - `@nebulr-group/bridge-svelte` in `package.json`
  - `src/routes/+layout.ts` calls `bridgeBootstrap()`
  - `src/routes/+layout.svelte` renders `<BridgeBootstrap />`
  - `VITE_BRIDGE_APP_ID` set in `.env`

## Step 1 — Subscription page

Create `src/routes/subscription/+page.svelte`:

```svelte
<script lang="ts">
  import { PlanSelector } from '@nebulr-group/bridge-svelte';
</script>

<h1>Choose a plan</h1>

<PlanSelector />
```

`<PlanSelector>` handles everything: loads plans, shows the current plan, routes free plan selection directly, and launches Stripe Checkout for paid plans. After payment or cancellation, Stripe returns to Bridge's unified callback handler which syncs billing state and redirects the user. No redirect pages or URL configuration needed.

**`<PlanSelector>` props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `successRedirect` | `string` | `/subscription` | Where to send the user after a successful payment |
| `cancelRedirect` | `string` | `/subscription` | Where to send the user after a cancelled payment |
| `onSelect` | `() => void` | — | Called after free plan selection or plan change |
| `planCard` | `Snippet` | — | Override the default plan card layout |

**Paywall (post-signup):** To redirect straight to the app after first payment instead of staying on the subscription page, set `successRedirect="/"`. The subscription syncs automatically on whichever page the user lands on — no extra wiring needed.

## Step 2 — Billing notice banner

Add `<BridgeBillingNotice />` to the root layout. It renders nothing when billing is healthy and automatically shows the right message for payment failures, trial endings, and cancellations:

```svelte
<BridgeBootstrap />
<BridgeBillingNotice />
{@render children()}
```

Import from `@nebulr-group/bridge-svelte`.

## Step 2b — Plan-selection paywall (default)

Set this up by default: a signed-in tenant with no plan is redirected to a dedicated
**welcome page** and can't use the app until they pick one. Returning users who already
have a plan pass straight through. Two parts:

**1. Create the welcome route** — `src/routes/welcome/+page.svelte`:

```svelte
<script lang="ts">
  import { PlanSelector } from '@nebulr-group/bridge-svelte';
</script>

<h1>Welcome — pick your plan</h1>

<PlanSelector />
```

**2. Register it as the paywall route** in `src/routes/+layout.ts`, where you already call
`bridgeBootstrap()`. Add `billing.paywallRoute` to the config and mark `/welcome` public in
the route guard (the user is authenticated but planless — `public` keeps the guard from
fighting the paywall redirect):

```ts
const config: BridgeConfig = {
  // …existing appId, callbackUrl, loginRoute…
  billing: { paywallRoute: '/welcome' },
};

const routeConfig: RouteGuardConfig = {
  rules: [
    // …existing rules…
    { match: '/welcome', public: true },
  ],
  defaultAccess: 'protected',
};

await bridgeBootstrap(url, config, routeConfig, fetch);
```

`BridgeBootstrap` reads `shouldSelectPlan` from the session and redirects planless users to
`paywallRoute` **before any page renders** — no per-page wiring needed. The redirect is gated
by the app-level `paymentsAutoRedirect` flag (**`true` by default**). To turn the whole paywall
off so users reach the app without choosing a plan:

```bash
bridge app update --payments-auto-redirect false
```

**Alternative — in-layout overlay.** If you'd rather gate in place than redirect to a route,
wrap the app in `<BridgePaywall>` instead of creating `/welcome`:

```svelte
<BridgeBootstrap />
<BridgeBillingNotice />
<BridgePaywall successRedirect="/">
  {@render children()}
</BridgePaywall>
```

`<BridgePaywall>` renders a fullscreen plan-selector overlay when `shouldSelectPlan` is true,
then disappears once a plan is chosen. Props:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `successRedirect` | `string` | `/` | Where to send the user after a successful Stripe payment |
| `cancelRedirect` | `string` | `/` | Where to send the user if they cancel Stripe Checkout |
| `onSelect` | `(detail) => void` | — | Side-effect hook after free-plan or direct plan change (analytics, pixel events) |
| `heading` | `Snippet` | — | Override the default "Choose a plan" heading |

Import `PlanSelector` / `BridgePaywall` from `@nebulr-group/bridge-svelte`.

## Step 3 — Quota and entitlement UI (optional)

Skip if the plans have no per-resource limits or feature differences.

> Quotas were configured in the master prompt via `bridge plan quota set` (`--policy hard` for blocking caps, `--policy metered --price-amount <n>` for per-unit billing). Entitlements are derived from `hard` quotas automatically — there is no `plan entitlement set` command. This step only covers surfacing them in the UI.

To show a live quota counter, drop in `<BridgeQuotaBanner metric="ai_completions" />` — it renders nothing if no quota is configured for the current plan. For **metered** quotas the banner shows live usage **and projected cost** (per-unit price × overage) and is informational (never blocking); read `useBridge().quota(metric)` for the raw `unitAmount` / `currency` / `overageEstimate` / `overcap` fields to build a custom metered cost display.

To gate a feature by entitlement, use `bridge.tenant.entitlements.can('key')` from `useBridge()`. Returns `false` until hydrated (fail-closed), updates live when the plan changes or quota exhausts.

## Step 4 — Billing portal

To let users manage their payment method or cancel, add a button that calls `getBridgeAuth().getPortalUrl()` and redirects to the returned URL. Import `getBridgeAuth` from `@nebulr-group/bridge-svelte`.

## Reading subscription state

The subscription state is available via `bridge.tenant.subscription` from `useBridge()`, or the `subscriptionStore` store. Both update reactively when the plan changes — no polling needed. Import from `@nebulr-group/bridge-svelte`.

## Billing checklist

Before verifying, confirm every item was applied:

- [ ] `bridge plan list` returns at least one plan
- [ ] `src/routes/subscription/+page.svelte` created with `<PlanSelector>` (no props needed for standard plan-change flow)
- [ ] `<BridgeBillingNotice />` added to root layout
- [ ] Paywall (default): `src/routes/welcome/+page.svelte` created with `<PlanSelector>`, `billing.paywallRoute: '/welcome'` set in `+layout.ts`, and `/welcome` marked public in the route guard — OR `<BridgePaywall>` wrapping `{@render children()}` for the overlay alternative
- [ ] Quota/entitlement UI added if plans have limits
- [ ] No extra packages installed (`@stripe/stripe-js` must NOT be in package.json)

## Verify

1. Navigate to `/subscription` — plan cards render with correct prices; a tier with monthly + yearly pricing shows both intervals.
2. Select a free plan — subscription updates immediately, no redirect.
3. Select a paid plan — Stripe Checkout launches.
4. Complete payment — redirected to `/subscription` with the updated plan showing.
5. Cancel payment — redirected to `/subscription`.
6. Paywall: sign in as a new tenant with no plan — you're redirected to `/welcome` and can't reach the app until a plan is chosen.
7. Run the project's build command — no TypeScript or import errors.

---

> **If you are running this guide as part of `bridge guide billing` (the master prompt):** this guide is now complete. Return to the master and continue with **Step 4b** (paywall), **Step 5** (verification), **Step 6** (success banner), and **Step 7** (follow-on tracks). Do not stop here.
