# Bridge SvelteKit — Billing

You are wiring **billing UI** into a SvelteKit application that uses The Bridge. Plans and Stripe are already configured — this guide covers the frontend only: the subscription page, lifecycle notices, quota counters, and the billing portal.

> **STOP — do not install any packages.** The only dependency is `@nebulr-group/bridge-svelte`, which is already installed. Do NOT install `@stripe/stripe-js` — the SDK redirects to Stripe Checkout via a plain URL redirect, no Stripe client library needed. `@stripe/stripe-js` appears in the package peer dep list for legacy reasons and must not be installed.

## Configuring plans, prices and quotas

These can be configured from the Bridge **MCP tools** or the **`bridge` CLI**. Same operations, same API:

| Operation | MCP | CLI |
|---|---|---|
| List plans (with prices + quotas) | `list_plans` | `bridge plan list` / `bridge plan get <key>` |
| Create a plan | `create_plan` — `key`, `name`, `description?`, `trial?`, `trialDays?` | `bridge plan create --key … --name …` |
| Edit a plan | `update_plan` — `key`, `name?`, `description?` | `bridge plan update --key … --name …` |
| Add/replace a price | `set_plan_price` — `key`, `amount`, `interval`, `currency?` | `bridge plan price set <key> --amount … --interval …` |
| Remove a price | `remove_plan_price` — `key`, `interval`, `currency?` | `bridge plan price rm <key> --interval …` |
| Add/replace a quota | `set_plan_quota` — `key`, `metric`, `limit`, `policy`, `priceAmount?`, `priceCurrency?` | `bridge plan quota set <key> --metric … --limit … --policy …` |
| Remove a quota | `remove_plan_quota` — `key`, `metric` | `bridge plan quota rm <key> --metric …` |

Use whichever is already set up. **If the user asks for a specific surface, use that one** — both reach the same API. If neither is available, offer to install one; only fall back to the dashboard if they decline.

The common two-tier shape — a free plan with a hard cap, a premium plan that meters the overage — is two `set_plan_quota` calls on the same metric:

```jsonc
// free: blocks at 1000
{ "key": "free",    "metric": "ai_completions", "limit": 1000, "policy": "hard" }

// premium: 10000 included, then $0.002 per extra unit
{ "key": "premium", "metric": "ai_completions", "limit": 10000, "policy": "metered",
  "priceAmount": 0.002, "priceCurrency": "USD" }
```

`limit: 0` with `policy: "metered"` bills from the first unit. `policy: "hard"` must **not** carry `priceAmount`. `priceCurrency` defaults to the plan's price currency when the plan has exactly one — pass it explicitly otherwise. On the CLI these are `--policy hard` and `--policy metered --price-amount 0.002`.

### Operations that are not plain MCP writes

Two of these used to be listed as "no MCP tool exists". `connect_stripe`,
`setup_payments` and `get_stripe_status` shipped in TBP-577, and the stale text
actively told agents not to look for them — costing at least one real session a
wrong answer to the user. If you find yourself writing "there is no tool for
this", check first.

- **Connecting Stripe.** `connect_stripe` over MCP (or `setup_payments`, which runs the whole payment setup), `bridge stripe connect --secret-key … --publishable-key …` on the CLI, or the dashboard. It needs a live Stripe secret key: ask the user for it. Never invent one and never reuse a key you found in a file.
- **Reading Stripe connection status**: `get_stripe_status` over MCP, `bridge stripe status` on the CLI. `get_app` also reports the app-level billing setup.
- **Turning the paywall off** (`bridge app update --payments-auto-redirect false`): CLI or dashboard only. `get_app` reads the setting; no MCP tool writes it.

## Prerequisites

Verify before starting:

- **At least one plan must exist** — `list_plans` (MCP) or `bridge plan list` (CLI). If there are none, create them with the table above, or run `bridge guide billing` (no `--framework`) for the master prompt's guided plan + Stripe setup, then come back here.
- **If any plan has a price, Stripe must be connected** — `bridge stripe status`, or `get_app` over MCP. If it isn't, `<PlanSelector>` will silently fail when a user picks a paid plan. Connecting Stripe is the human step described above. Free-only setups can skip this check.

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

There is no MCP tool for this app-level setting — `get_app` reads it, nothing over MCP writes it. Use the CLI or the dashboard.

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

## Step 3 — Reading quota: client and server

**Required if any plan has a limit or a metered price.** (Skip only when every plan is flat-rate with no per-resource limits.)

> Quotas are configured with `set_plan_quota` (MCP) or `bridge plan quota set` (CLI) — `hard` / `--policy hard` for blocking caps, `metered` + `priceAmount` / `--policy metered --price-amount <n>` for per-unit billing; see *Configuring plans, prices and quotas* above. Entitlements are derived from `hard` quotas automatically — there is no entitlement tool or `plan entitlement set` command.

Pick by what you need:

| What you need | Use | Where |
|---|---|---|
| A live usage counter, ready-made | `<BridgeQuotaBanner metric="decks" />` | component |
| The raw numbers, for your own UI | `useBridge().quota(metric)` from `@nebulr-group/bridge-auth-core` → `QuotaSnapshot` | component or `.svelte.ts` |
| Gate a feature on/off by plan | `bridge.tenant.entitlements.can('key')` (`bridge` from `@nebulr-group/bridge-svelte`) | anywhere |
| **Actually enforce a cap** | **Your server, not here** — see below | backend |

> `@nebulr-group/bridge-svelte` does **not** export `useBridge`. The quota read is the one place you import from `@nebulr-group/bridge-auth-core` (already installed — it is bridge-svelte's peer dependency): `import { useBridge } from '@nebulr-group/bridge-auth-core';`. Import the `QuotaSnapshot` type from `@nebulr-group/bridge-svelte`.

### Do not proxy quota through your own API

The client reads quota **directly from Bridge**. You do not need an endpoint on your own API that relays it, and you should not hand-copy the `QuotaSnapshot` shape into your codebase — `useBridge().quota(metric)` (auth-core) returns it typed.

A `/quota` route on your own API, a hand-written `type MyQuota = { used, limit, remaining, … }`, and bespoke counter markup are three symptoms of the same wrong turn.

### Enforcement is server-side. Always.

A client-side check is **display, not enforcement** — anyone can call your API directly and skip it. Disabling a button is good UX and worth doing; it is not a cap.

The cap itself belongs in your backend, which reads the same quota through its own SDK and refuses the write. For NestJS that is `BridgeService.fromJwt(jwt).usage.quota(metric)` plus `usage.report(metric, 1, idempotencyKey)` — see the **bridge-nestjs billing guide** (`get_integration_guide` with `topic=billing`, `framework=nestjs`). The two halves are independent: the client shows the number, the server decides.

### `hard` vs `metered` — they behave oppositely

- **`hard`** blocks. When `remaining <= 0` the action must be refused.
- **`metered`** never blocks. Units above `limit` are billed per unit, so disabling the control on a metered plan means refusing money a customer has agreed to spend.

Branch on `policy`, never on `remaining` alone.

### Entitlements

`bridge.tenant.entitlements.can('key')` (`import { bridge } from '@nebulr-group/bridge-svelte'`) returns `false` until hydrated (fail-closed) and updates live when the plan changes or a quota exhausts. For a reactive read in a template, use the store: `const entitlements = bridge.tenant.entitlements.snapshot;` then `$entitlements?.key`.

## Step 4 — Billing portal

To let users manage their payment method or cancel, add a button that calls `getBridgeAuth().getPortalUrl()` and redirects to the returned URL. Import `getBridgeAuth` from `@nebulr-group/bridge-svelte`.

## Reading subscription state

The subscription state is available via `bridge.tenant.subscription` (a store on the `bridge` singleton), or the `subscriptionStore` store. Both update reactively when the plan changes — no polling needed. Import `bridge` / `subscriptionStore` from `@nebulr-group/bridge-svelte` (it does not export a `useBridge()` hook).

## Billing checklist

Before verifying, confirm every item was applied:

- [ ] At least one plan exists (`list_plans` over MCP, `bridge plan list` on the CLI)
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
