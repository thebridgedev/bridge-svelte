# Bridge SvelteKit — Billing

You are wiring **billing UI** into a SvelteKit application that uses The Bridge. Plans and Stripe are already configured — this guide covers the frontend only: the subscription pages, lifecycle notices, plan limits in the UI, and the billing portal.

`bridge guide mechanisms` is the one-page model this guide builds on: the server decides and the client decorates, a POST increments the limit, counter vs gauge, and the three UI levels.

> **Do not install any packages.** The only dependency is `@nebulr-group/bridge-svelte`, already installed. Checkout is a plain redirect to Stripe, so `@stripe/stripe-js` is not needed, even though it appears in the package's optional peer dependencies.

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
| **Your backend refused a request at a plan limit** — tell the user and offer the upgrade | nothing — `<BridgeBootstrap>` opens the upgrade dialog on the backend's `402 QUOTA_EXCEEDED` | (no code) |
| **Disable an action at the cap**, before the click | `<QuotaGate metric="…">` around it | the component |
| **Show markup only when the plan grants it** | `<Entitled to="…">` in markup; `$entitlements.can('key')` in script | the component |
| **A usage counter** — "42 of 1000 decks" | `<BridgeQuotaBanner metric="…" />` | the component |
| **The raw quota numbers**, for your own UI | `useQuota(metric)` | component or `.svelte.ts` |
| **Usage from an app with no backend** (local-first, mobile) | `bridge.usage.report(metric)` / `bridge.usage.set(metric, n)` — self-reported, see Step 3 | anywhere |
| **Current plan / subscription state** | `bridge.tenant.subscription`, or `subscriptionStore` | anywhere |
| **Manage payment method, cancel** | `<BillingPortalButton />` (already on `/subscription`) | anywhere else you want the button |
<<<<<<< HEAD
<<<<<<< HEAD
| **Actually enforcing a cap** | **your server — not this guide** | your backend |
=======
| **Actually enforcing a cap** | **your server** — `@RequireQuota` / `@RequireEntitlement` in bridge-nestjs | your backend |
>>>>>>> origin/feature/mcp-journey
=======
| **Actually enforcing a cap** | **your server** — `@RequireQuota` / `@RequireEntitlement` in bridge-nestjs | your backend |
>>>>>>> origin/feature/mcp-journey

Two rows have real blast radius, and both are easy to get wrong in the same direction:

- **The plan-less gate belongs to `bridgeBootstrap()`, not to a page.** It redirects before any page renders, to `/subscription/plan` unless `billing.paywallRoute` says otherwise. Checking "does this tenant have a plan?" inside a component means the page has already loaded and its `load` has already run, so you are redirecting after the fact — the same mistake as gating a route from inside the route.
<<<<<<< HEAD
<<<<<<< HEAD
- **A client-side quota check is display, not enforcement.** Anyone can call your API directly and skip it. Disabling a button is good UX and worth doing; the cap itself has to live in your backend, which reads the same quota through its own SDK and refuses the write.
=======
- **A client-side quota check is display, not enforcement.** Anyone can call your API directly and skip it. The server is authoritative, the client is decorative: the backend's decorator refuses the write; the upgrade dialog, `<QuotaGate>` and `<Entitled>` only explain or anticipate that refusal. Do not write a quota `if` on a page — the dialog already covers the refusal with zero code.
>>>>>>> origin/feature/mcp-journey
=======
- **A client-side quota check is display, not enforcement.** Anyone can call your API directly and skip it. The server is authoritative, the client is decorative: the backend's decorator refuses the write; the upgrade dialog, `<QuotaGate>` and `<Entitled>` only explain or anticipate that refusal. Do not write a quota `if` on a page — the dialog already covers the refusal with zero code.
>>>>>>> origin/feature/mcp-journey

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
| Add/replace a quota | `set_plan_quota` — `key`, `metric`, `limit`, `policy`, `kind?`, `priceAmount?`, `priceCurrency?` | `bridge plan quota set <key> --metric … --limit … --policy … [--kind gauge]` |
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

**Counter or gauge?** If deleting it frees room, it's a gauge and your app counts it; if it happened, it's a counter and Bridge counts it. Projects, seats and documents are gauges (`kind: "gauge"` — "8 of 10 projects", never reset); AI completions, exports and API calls are counters (the default — "40 of 100 this month", reset each period). Seats (`metric: "users"`) are counted by Bridge from workspace members; every other gauge value comes from your app.

`limit: 0` with `policy: "metered"` bills from the first unit. `policy: "hard"` must **not** carry `priceAmount`. `priceCurrency` defaults to the plan's price currency when the plan has exactly one — pass it explicitly otherwise. On the CLI these are `--policy hard` and `--policy metered --price-amount 0.002`.

### Stripe and the paywall setting

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

Already on, as soon as the app has plans (the default paywall stands aside for an app with none; a `paywallRoute` you set always applies). A signed-in tenant with no plan is redirected to `/subscription/plan` **before any page renders** and can't use the app until they pick one; returning users who already have a plan pass straight through. Step 1's file serves that page — there is nothing else to create and nothing to configure.

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

## Step 3 — Plan limits in the UI

**Required if any plan has a limit or a metered price.** (Skip only when every plan is flat-rate with no per-resource limits.)

> Quotas are configured with `set_plan_quota` (MCP) or `bridge plan quota set` (CLI) — `hard` / `--policy hard` for blocking caps, `metered` + `priceAmount` / `--policy metered --price-amount <n>` for per-unit billing; see *Configuring plans, prices and quotas* above. Entitlements are derived from `hard` quotas automatically — there is no entitlement tool or `plan entitlement set` command.

<<<<<<< HEAD
**The enforcement model: the server is authoritative, the client is decorative.** Your backend refuses a request at the cap — with bridge-nestjs that is one decorator on the handler that creates the thing (`@RequireQuota('tickets')`, `@RequireEntitlement('analytics')`; see the **bridge-nestjs billing guide**, `get_integration_guide` with `topic=billing`, `framework=nestjs`). Everything in this step only *shows* that decision. Pick the lowest level that does the job — everything is imported from `@nebulr-group/bridge-svelte`:
=======
**The enforcement model: the server is authoritative, the client is decorative.** Your backend refuses a request at the cap — with bridge-nestjs that is one decorator on the handler that creates the thing (`@RequireQuota('tickets')`, `@RequireEntitlement('analytics')`; `bridge guide nestjs billing`). Everything in this step only *shows* that decision. Pick the lowest level that does the job — everything is imported from `@nebulr-group/bridge-svelte`:
>>>>>>> origin/feature/mcp-journey

| Level | What the page writes | What the user sees |
|---|---|---|
| **0 — nothing** (default) | `<button onclick={createTicket}>New ticket</button>` — no Bridge code | The click is refused by the backend (`402 QUOTA_EXCEEDED`) and the **upgrade dialog** opens, naming the metric and linking to the subscription page |
| **1 — one component** | `<QuotaGate metric="tickets">…</QuotaGate>`, `<Entitled to="analytics">…</Entitled>` | The button is disabled at the cap with an upgrade line beside it; a paid feature shows only on a plan that grants it |
| **2 — your own UI** | `useQuota(metric)`, `$entitlements.can(key)` | Whatever you build from the numbers |

### Level 0 — the upgrade dialog (no code)

`<BridgeBootstrap>` mounts `<BridgeUpgradeDialog>`, on by default. When a request to **your own backend** answers `402` with `{ code: 'QUOTA_EXCEEDED', metric, used, limit, fix }` — exactly what `@RequireQuota` sends — the dialog opens: "This workspace has used 3 of 3 tickets on its current plan", with **Upgrade plan** linking to `fix` (a same-app path such as `/subscription`) or else `billing.manageRoute` (default `/subscription`).

- Plain `fetch` is covered for the page's own origin (a SvelteKit endpoint or `/api` proxy) and Bridge's API. A backend on **another origin**: call it with `bridgeFetch()` (which also sends the user's token), or list it in `billing.apiOrigins: ['https://api.example.com']`.
- Your code still receives the `402` response unchanged — handle it as you would any failed write (e.g. do not add the item to the list).
- `billing: { upgradeDialog: false }` in `bridgeBootstrap({...})` turns it off; `billing: { upgradeDialog: MyDialog }` replaces it (props: `refusal`, `upgradeHref`, `onclose`). With it off, `onBridgeQuotaExceeded((refusal) => …)` hands you the same refusal.

Do **not** add a `try/catch` that shows your own "limit reached" toast on every page, and do not pre-check the quota before each call — that is the code level 0 exists to delete.

### Level 1 — `<QuotaGate>` and `<Entitled>`

When the button should react *before* the click:

```svelte
<script lang="ts">
  import { QuotaGate, Entitled } from '@nebulr-group/bridge-svelte';
</script>

<QuotaGate metric="tickets">
  <button onclick={createTicket}>New ticket</button>
  {#snippet atLimit(quota)}
    {quota.used} of {quota.limit} tickets used. <a href="/subscription">Upgrade</a>
  {/snippet}
</QuotaGate>

<Entitled to="analytics">
  <AnalyticsPanel />
  {#snippet fallback()}<a href="/subscription">Upgrade for analytics</a>{/snippet}
</Entitled>
```

- `<QuotaGate metric>` disables every button/input inside it (a `<fieldset disabled>`) only at a **known hard cap**, and shows `atLimit(quota)` — or a default "You've used all N … Upgrade" line — beside it. While the quota is loading, when the plan has no quota on the metric, and for `metered` quotas it stays **enabled**: "not loaded yet" is never "zero".
- `<Entitled to>` renders the children when the plan grants the key and `fallback` when it does not. Until Bridge has answered it renders neither (only an optional `loading` snippet), so a cold start never flashes the paywall at a paying workspace.
- **Do not wrap `<Entitled to="tickets">` around `<QuotaGate metric="tickets">`.** Bridge turns every hard quota into an entitlement of the same name, which becomes `false` at the cap — the `<Entitled>` would hide the button and the gate's upgrade line with it. Use `<Entitled>` for plan *features* (`analytics`, `sso`) and `<QuotaGate>` for *counted* things (`tickets`, `projects`).
- In script, the same entitlement answer is `$entitlements.can('key')` (check `$entitlements.ready` first).

### Level 2 — your own UI: `useQuota(metric)`

```svelte
<script lang="ts">
  import { useQuota } from '@nebulr-group/bridge-svelte';
  const projects = useQuota('projects');
</script>

{#if projects.loading}
  <Spinner />
{:else if projects.unlimited}
  Unlimited projects
{:else}
  {projects.used} of {projects.limit} projects ({projects.remaining} left)
{/if}
```

It returns `{ loading, unlimited, used, limit, remaining, warningLevel, kind, snapshot }` and updates live. While `loading`, the numbers are `null` — never `0` — so branch on `loading` first instead of rendering `used ?? 0`. `unlimited` means the plan puts no quota on the metric. `kind` is `'counter'` (this period's total) or `'gauge'` (how many exist now). When the metric key is itself reactive (a prop), pass a getter: `useQuota(() => metric)`. `snapshot` is the full `QuotaSnapshot` (`policy`, overage fields); import that type from `@nebulr-group/bridge-svelte` too.

### Do not proxy quota through your own API

The client reads quota **directly from Bridge**. You do not need an endpoint on your own API that relays it, and you should not hand-copy the `QuotaSnapshot` shape into your codebase — `useQuota(metric)` returns it typed.

A `/quota` route on your own API, a hand-written `type MyQuota = { used, limit, remaining, … }`, and bespoke fetch-and-poll counter code are three symptoms of the same wrong turn.

### Enforcement is the backend's

The cap belongs on the backend handler that creates the thing — with NestJS one decorator: `@RequireQuota('tickets', { current })` for something that exists and can be deleted (a gauge), `@RequireQuota('exports')` for something that happened (a counter), `@RequireEntitlement('analytics')` for a plan feature. A POST increments the limit; there is nothing else to wire. It refuses with the `402 QUOTA_EXCEEDED` body that opens the level-0 dialog — `bridge guide nestjs billing`.

<<<<<<< HEAD
The cap itself belongs in your backend. With NestJS it is one decorator on the handler that creates the thing — `@RequireQuota('tickets', { current })` for something that exists and can be deleted (a gauge), `@RequireQuota('exports')` for something that happened (a counter), `@RequireEntitlement('analytics')` for a plan feature. It checks before the handler runs, records usage after it succeeds, and refuses with the `402 QUOTA_EXCEEDED` body that opens the level-0 dialog — see the **bridge-nestjs billing guide** (`get_integration_guide` with `topic=billing`, `framework=nestjs`). The two halves are independent: the client shows, the server decides.

=======
>>>>>>> origin/feature/mcp-journey
### Reporting usage from the browser — self-reported

An app with no backend that sees the action — a local-first or mobile app whose data lives on the device — reports usage from the client:

```ts
import { bridge } from '@nebulr-group/bridge-svelte';

bridge.usage.report('exports');                // a counter: something happened
await bridge.usage.set('projects', projects.length); // a gauge: how many exist now
```

If deleting it frees room, it's a gauge and your app counts it (`set`, after every create and delete, with the absolute count); if it happened, it's a counter and Bridge counts it (`report`). `report` is fire-and-forget and queued durably; `set` resolves once Bridge has stored the value and rejects if it was refused.

**This is trusted-client usage.** Anything running in the browser can send any number, so a frontend-only app **cannot enforce** a quota — Bridge shows and bills what the client reports, and the client can lie. When the app has a backend, report and enforce there instead; use the browser path only when there is no server to do it.

### `hard` vs `metered` — they behave oppositely

- **`hard`** blocks. When `remaining <= 0` the backend refuses the action.
- **`metered`** never blocks. Units above `limit` are billed per unit, so disabling the control on a metered plan means refusing money a customer has agreed to spend.

`<QuotaGate>` already branches on `policy`. In your own UI, branch on `policy`, never on `remaining` alone.

### Entitlements in script

<<<<<<< HEAD
`<Entitled to="key">` is the markup form. In script:
=======
`<Entitled to="key">` is the markup form. A plan feature is a `hard` quota nothing counts (`bridge plan quota set pro --metric analytics --limit 1 --policy hard`); `app_active` is true while the subscription is active. In script:
>>>>>>> origin/feature/mcp-journey

```svelte
<script lang="ts">
  import { entitlements } from '@nebulr-group/bridge-svelte';
</script>

{#if !$entitlements.ready}
  <Spinner />
{:else if $entitlements.can('ai_completions')}
  <AiPanel />
{:else}
  <UpgradePrompt />
{/if}
```

`$entitlements.can(key)` is fail-closed — `false` until Bridge has answered — and updates live when the plan changes or a hard quota reaches its cap. `$entitlements.ready` is what tells "not loaded yet" apart from "this plan cannot": check it first, so a cold start shows a spinner rather than an upgrade prompt. Outside a component, `bridge.tenant.entitlements.can('key')` is the same answer, read once.

## Step 4 — Billing portal

The "Manage billing" button (payment method, invoices, cancel) is already on `/subscription`. To put it anywhere else, render `<BillingPortalButton />` from `@nebulr-group/bridge-svelte`: it shows only for the workspace owner on an app with payments on whose workspace has a plan, and fetches a one-time portal URL at click time.

For a fully custom button, the method is `getBridgeAuth().getBillingPortalUrl()` — there is no `getPortalUrl()`. It returns a one-time Stripe portal URL built from the `apiBaseUrl` you configured, so it follows your app to stage or local dev; do not hand-roll a `fetch` against a hardcoded `https://api.thebridge.dev`. The session is short-lived, so call it at click time rather than caching the result.

## Reading subscription state

<<<<<<< HEAD
The subscription state is available via `bridge.tenant.subscription` (a store on the `bridge` singleton), or the `subscriptionStore` store. Both update reactively when the plan changes — no polling needed. Import `bridge` / `subscriptionStore` from `@nebulr-group/bridge-svelte`. Inside a component, `useBridge()` returns the same `bridge` object.
=======
The subscription state is available via `bridge.tenant.subscription` (a store on the `bridge` singleton), or the `subscriptionStore` store. Both update reactively when the plan changes — no polling needed. Import `bridge` / `subscriptionStore` from `@nebulr-group/bridge-svelte`. `useBridge()` returns the same object (a test can override it with `setBridgeContext`).
>>>>>>> origin/feature/mcp-journey

## Billing checklist

Before verifying, confirm every item was applied:

- [ ] At least one plan exists (`list_plans` over MCP, `bridge plan list` on the CLI)
- [ ] `src/routes/subscription/[...bridge]/+page.svelte` created with `<BridgeBillingRoutes />` — and no hand-written `/billing`, `/payment-error`, success or paywall pages
- [ ] `<BridgeBillingNotice />` added to root layout
- [ ] Paywall: nothing to add (default `/subscription/plan`). `/welcome` + `billing.paywallRoute: '/welcome'` ONLY if the user asked for it — OR `<BridgePaywall>` + `billing.paywallRoute: false` for the overlay alternative
<<<<<<< HEAD
<<<<<<< HEAD
- [ ] Quota/entitlement UI added if plans have limits
=======
- [ ] Plan limits: the backend enforces them (`@RequireQuota` / `@RequireEntitlement`); the frontend relies on the level-0 dialog, adding `<QuotaGate>` / `<Entitled>` only where the UI should react before the click — no hand-written quota checks, toasts or `/quota` endpoints
- [ ] No `<Entitled>` wrapped around a `<QuotaGate>` on the same key
>>>>>>> origin/feature/mcp-journey
=======
- [ ] Plan limits: the backend enforces them (`@RequireQuota` / `@RequireEntitlement`); the frontend relies on the level-0 dialog, adding `<QuotaGate>` / `<Entitled>` only where the UI should react before the click — no hand-written quota checks, toasts or `/quota` endpoints
- [ ] No `<Entitled>` wrapped around a `<QuotaGate>` on the same key
>>>>>>> origin/feature/mcp-journey
- [ ] No extra packages installed (`@stripe/stripe-js` must NOT be in package.json)

## Verify

1. Navigate to `/subscription` — plan cards render with correct prices; a tier with monthly + yearly pricing shows both intervals.
2. Select a free plan — subscription updates immediately, no redirect.
3. Select a paid plan — Stripe Checkout launches.
4. Complete payment — redirected to `/subscription/success` with the new plan showing.
5. Cancel payment — back on `/subscription`.
6. Paywall: sign in as a new tenant with no plan — you're redirected to `/subscription/plan` (or `/welcome`, if the user opted in) and can't reach the app until a plan is chosen.
7. `/subscription/nope` shows the app's own 404.
<<<<<<< HEAD
<<<<<<< HEAD
8. Run the project's build command — no TypeScript or import errors.
=======
8. Plan limits: with a workspace at a hard cap, the action behind `@RequireQuota` answers `402` and the upgrade dialog opens naming the metric; **Upgrade plan** reaches `/subscription`. A `<QuotaGate>` around that action shows it disabled at the cap and enabled while the page loads.
9. Run the project's build command — no TypeScript or import errors.
>>>>>>> origin/feature/mcp-journey
=======
8. Plan limits: with a workspace at a hard cap, the action behind `@RequireQuota` answers `402` and the upgrade dialog opens naming the metric; **Upgrade plan** reaches `/subscription`. A `<QuotaGate>` around that action shows it disabled at the cap and enabled while the page loads.
9. Run the project's build command — no TypeScript or import errors.
>>>>>>> origin/feature/mcp-journey

---

> **If you are running this guide as part of `bridge guide billing` (the master prompt):** this guide is now complete. Return to the master and continue with **Step 4b** (paywall), **Step 5** (verification), **Step 6** (success banner), and **Step 7** (follow-on tracks). Do not stop here.
