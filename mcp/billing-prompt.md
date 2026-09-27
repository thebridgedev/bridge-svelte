# Bridge SvelteKit — Billing

You are wiring **billing UI** into a SvelteKit application that uses The Bridge. Plans and Stripe are already configured — this guide covers the frontend only: the subscription page, lifecycle notices, quota counters, and the billing portal.

> **STOP — do not install any packages.** The only dependency is `@nebulr-group/bridge-svelte`, which is already installed. Do NOT install `@stripe/stripe-js` — the SDK redirects to Stripe Checkout via a plain URL redirect, no Stripe client library needed. `@stripe/stripe-js` appears in the package peer dep list for legacy reasons and must not be installed.

## Decide first — which billing surface?

Read this table before writing anything. Every case below is already solved by the SDK, and each row is a different surface — picking the wrong one is how a paywall ends up hand-rolled in a page component.

| What you are wiring | Use | Where |
|---|---|---|
| **The subscription page, the paywall, the checkout success/error pages** | `<BridgeBillingRoutes />` — one file serves all four | `src/routes/subscription/[...bridge]/+page.svelte` |
| **A plan-less tenant must not reach the app** | nothing to add — `bridgeBootstrap()` redirects to `/subscription/plan` by default | (the file above) |
| …an onboarding page at another address, e.g. `/welcome` | `<BridgePaywallPage>` + `billing.paywallRoute` — **only if the user asks for it**, see Step 2b | `src/routes/welcome/+page.svelte` + `+layout.ts` |
| …the same gate as an overlay instead of a redirect | `<BridgePaywall>` wrapping `{@render children()}`, plus `billing: { paywallRoute: false }` | root `+layout.svelte` + `+layout.ts` |
| **A plan picker somewhere else** | `<PlanSelector>` | any component |
| **Lifecycle messages** — payment failed, trial ending, cancelled | `<BridgeBillingNotice />` | root `+layout.svelte` |
| **A usage counter** — "42 of 1000 decks" | `<BridgeQuotaBanner metric="…" />` | the component |
| **The raw quota numbers**, for your own UI | `useBridge().quota(metric)` from `@nebulr-group/bridge-auth-core` | component or `.svelte.ts` |
| **A feature on or off by plan** | `bridge.tenant.entitlements.can('key')` | anywhere |
| **Current plan / subscription state** | `bridge.tenant.subscription`, or `subscriptionStore` | anywhere |
| **Manage payment method, cancel** | `<BillingPortalButton />` (already on `/subscription`) | anywhere else you want the button |
| **Actually enforcing a cap** | **your server — not this guide** | your backend |

Two rows have real blast radius, and both are easy to get wrong in the same direction:

- **The plan-less gate belongs to `bridgeBootstrap()`, not to a page.** It redirects before any page renders, to `/subscription/plan` unless `billing.paywallRoute` says otherwise. Checking "does this tenant have a plan?" inside a component means the page has already loaded and its `load` has already run, so you are redirecting after the fact — the same mistake as gating a route from inside the route.
- **A client-side quota check is display, not enforcement.** Anyone can call your API directly and skip it. Disabling a button is good UX and worth doing; the cap itself has to live in your backend, which reads the same quota through its own SDK and refuses the write.

If the user has not said whether they want the redirect paywall or the overlay, the redirect is the default — and it is already on once Step 1's file exists. Do not hand-write a paywall page, a `/billing` page or a `/payment-error` page: `<BridgeBillingRoutes />` serves every page Bridge redirects to.

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
  - `src/routes/+layout.ts` has `export const load = bridgeBootstrap({ rules, … })`
  - `src/routes/+layout.svelte` wraps the app in `<BridgeBootstrap>…</BridgeBootstrap>`
  - `VITE_BRIDGE_APP_ID` set in `.env` (plus `VITE_BRIDGE_API_BASE_URL` for a stage or local app)

## Step 1 — The billing pages: one file

Create `src/routes/subscription/[...bridge]/+page.svelte`:

```svelte
<script lang="ts">
  import { BridgeBillingRoutes } from '@nebulr-group/bridge-svelte';
</script>

<BridgeBillingRoutes />
```

That one file serves every billing page, and Bridge's defaults point at them — no config needed:

| Address | What it shows | Default of |
|---|---|---|
| `/subscription` | Current plan, `<PlanSelector>` to upgrade/downgrade, "Manage billing" (Stripe portal) | `billing.manageRoute` — where the Upgrade/Manage buttons in `<BridgeBillingNotice>` and `<BridgeQuotaBanner>` go |
| `/subscription/plan` | The paywall: plan picker for a workspace with no plan | `billing.paywallRoute` |
| `/subscription/success` | Where a completed checkout lands; re-reads the subscription | — |
| `/subscription/error` | Where a checkout that could not be confirmed lands | `billing.paymentErrorRoute` |

An unknown address under `/subscription` gets the app's own 404. `/subscription` is protected by the default route rules — do not mark it public; a signed-out visitor has no plan to show.

**Customising, cheapest first:** `--bridge-*` CSS tokens; a `frame(page, content)` snippet replacing everything around each page and a `heading(page)` snippet replacing each heading; or take over one page by creating it (`src/routes/subscription/+page.svelte` wins over the catch-all, the other pages keep working). Do not recreate the whole set by hand.

**Where Stripe returns.** Stripe sends the user back to your app's `callbackUrl` — the same route as the OAuth callback, which defaults to `<your origin>/auth/oauth-callback` — with `?stripe_success=1&session_id=…` or `?stripe_cancel=1`, plus the destination as `redirect`. `bridgeBootstrap()` in your root `+layout.ts` recognises it there: on success it confirms the checkout with Bridge, refreshes the token so the new plan is in it, and redirects to the success page; on cancel back to the page the checkout started from. If confirmation fails it redirects to `/subscription/error`. So the callback route must exist (the SDK auth and hosted auth guides already provide it) and must be public; no other pages or URL configuration are needed. Only same-origin paths are followed as a destination; anything else falls back to `/subscription`.

**`<PlanSelector>`** is the picker these pages render. Use it directly only for a plan picker somewhere else in the app:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `successRedirect` | `string` | `/subscription` | Where to send the user after a successful payment |
| `cancelRedirect` | `string` | `/subscription` | Where to send the user after a cancelled payment |
| `onSelect` | `() => void` | — | Called after free plan selection or plan change |
| `planCard` | `Snippet` | — | Override the default plan card layout |

## Step 2 — Billing notice banner

Add `<BridgeBillingNotice />` to the root layout, inside `<BridgeBootstrap>`. It renders nothing when billing is healthy and automatically shows the right message for payment failures, trial endings, and cancellations:

```svelte
<BridgeBootstrap>
  <BridgeBillingNotice />
  {@render children()}
</BridgeBootstrap>
```

Import from `@nebulr-group/bridge-svelte`.

## Step 2b — Plan-selection paywall (default)

Already on. A signed-in tenant with no plan is redirected to `/subscription/plan` **before any page renders** and can't use the app until they pick one; returning users who already have a plan pass straight through. Step 1's file serves that page — there is nothing else to create and nothing to configure.

The redirect is gated by the app-level `paymentsAutoRedirect` flag (**`true` by default**). To turn the whole paywall off so users reach the app without choosing a plan:

```bash
bridge app update --payments-auto-redirect false
```

There is no MCP tool for this app-level setting — `get_app` reads it, nothing over MCP writes it. Use the CLI or the dashboard.

### The welcome page: offer it, never create it unasked

Some products want the plan choice to be an onboarding step at its own address, e.g. `/welcome`, with its own copy. That is a **product decision for the user, not a default**:

- **Never create `/welcome` (or any other onboarding/paywall page) unless the user asked for one.** The paywall already works without it.
- **Offer it as a question** when the integration is onboarding-shaped — the user is setting up signup, a first-run experience, or asks what a new user sees — for example: *"New workspaces without a plan currently land on `/subscription/plan`. Do you want a dedicated onboarding page for that instead, e.g. `/welcome` with your own heading?"* Ask once; if they decline or don't answer, leave the default.

Only if they say yes, create `src/routes/welcome/+page.svelte`:

```svelte
<script lang="ts">
  import { BridgePaywallPage } from '@nebulr-group/bridge-svelte';
</script>

<BridgePaywallPage heading="Pick a plan to get started" />
```

and point the paywall at it in the `bridgeBootstrap()` call in `src/routes/+layout.ts`:

```ts
export const load = bridgeBootstrap({
  // …existing options…
  billing: { paywallRoute: '/welcome' },
});
```

The config line is required: the redirect runs in the root `load` before any page renders — including before `/welcome` has ever been visited — so it must know the address up front. Do not mark `/welcome` public. `<BridgePaywallPage>` takes `heading`, optional `children` (content above the plans), `successRedirect` (default `/subscription/success`) and `cancelRedirect` (default: the page itself).

### Alternative — in-layout overlay

If the user would rather gate in place than redirect to a route, wrap the app in `<BridgePaywall>` and turn the redirect off:

```svelte
<BridgeBootstrap>
  <BridgeBillingNotice />
  <BridgePaywall successRedirect="/">
    {@render children()}
  </BridgePaywall>
</BridgeBootstrap>
```

```ts
export const load = bridgeBootstrap({
  // …existing options…
  billing: { paywallRoute: false },
});
```

`<BridgePaywall>` renders a fullscreen plan-selector overlay when `shouldSelectPlan` is true,
then disappears once a plan is chosen. Props:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `successRedirect` | `string` | `/` | Where to send the user after a successful Stripe payment |
| `cancelRedirect` | `string` | `/` | Where to send the user if they cancel Stripe Checkout |
| `onSelect` | `(detail) => void` | — | Side-effect hook after free-plan or direct plan change (analytics, pixel events) |
| `heading` | `Snippet` | — | Override the default "Choose a plan" heading |

Import `BridgePaywallPage` / `BridgePaywall` from `@nebulr-group/bridge-svelte`.

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

> `@nebulr-group/bridge-svelte` does **not** export `useBridge`, and the `bridge` singleton carries no quota accessor. `<BridgeQuotaBanner />` is the only quota surface bridge-svelte itself ships — prefer it. For raw numbers, the quota read is the one place you import from `@nebulr-group/bridge-auth-core`: `import { useBridge } from '@nebulr-group/bridge-auth-core';`. Add that package to your app's own dependencies (`{pm} add @nebulr-group/bridge-auth-core`) instead of relying on it being hoisted as bridge-svelte's peer dependency — an undeclared import resolves under npm/bun's flat `node_modules` but fails under pnpm and Yarn PnP. Import the `QuotaSnapshot` type from `@nebulr-group/bridge-svelte`.

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

The "Manage billing" button (payment method, invoices, cancel) is already on `/subscription`. To put it anywhere else, render `<BillingPortalButton />` from `@nebulr-group/bridge-svelte`: it shows only for the workspace owner on an app with payments on whose workspace has a plan, and fetches a one-time portal URL at click time.

For a fully custom button, the method is `getBridgeAuth().getBillingPortalUrl()` — there is no `getPortalUrl()`. It returns a one-time Stripe portal URL built from the `apiBaseUrl` you configured, so it follows your app to stage or local dev; do not hand-roll a `fetch` against a hardcoded `https://api.thebridge.dev`. The session is short-lived, so call it at click time rather than caching the result.

## Reading subscription state

The subscription state is available via `bridge.tenant.subscription` (a store on the `bridge` singleton), or the `subscriptionStore` store. Both update reactively when the plan changes — no polling needed. Import `bridge` / `subscriptionStore` from `@nebulr-group/bridge-svelte` (it does not export a `useBridge()` hook).

## Billing checklist

Before verifying, confirm every item was applied:

- [ ] At least one plan exists (`list_plans` over MCP, `bridge plan list` on the CLI)
- [ ] `src/routes/subscription/[...bridge]/+page.svelte` created with `<BridgeBillingRoutes />` — and no hand-written `/billing`, `/payment-error`, success or paywall pages
- [ ] `<BridgeBillingNotice />` added to root layout
- [ ] Paywall: nothing to add (default `/subscription/plan`). `/welcome` + `billing.paywallRoute: '/welcome'` ONLY if the user asked for it — OR `<BridgePaywall>` + `billing.paywallRoute: false` for the overlay alternative
- [ ] Quota/entitlement UI added if plans have limits
- [ ] No extra packages installed (`@stripe/stripe-js` must NOT be in package.json)

## Verify

1. Navigate to `/subscription` — plan cards render with correct prices; a tier with monthly + yearly pricing shows both intervals.
2. Select a free plan — subscription updates immediately, no redirect.
3. Select a paid plan — Stripe Checkout launches.
4. Complete payment — redirected to `/subscription/success` with the new plan showing.
5. Cancel payment — back on `/subscription`.
6. Paywall: sign in as a new tenant with no plan — you're redirected to `/subscription/plan` (or `/welcome`, if the user opted in) and can't reach the app until a plan is chosen.
7. `/subscription/nope` shows the app's own 404.
8. Run the project's build command — no TypeScript or import errors.

---

> **If you are running this guide as part of `bridge guide billing` (the master prompt):** this guide is now complete. Return to the master and continue with **Step 4b** (paywall), **Step 5** (verification), **Step 6** (success banner), and **Step 7** (follow-on tracks). Do not stop here.
