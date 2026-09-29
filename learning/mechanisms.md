# How Bridge works

The rules every Bridge guide builds on, on one page: what the smallest integration is, where a plan limit is counted, the three ways to show a limit in the UI, and the four levels of customising Bridge's pages. Coding agents get the same page from `bridge guide mechanisms`.

The frontend examples are SvelteKit (`@nebulr-group/bridge-svelte`); the backend examples are NestJS (`@nebulr-group/bridge-nestjs`).

Who gets which feature, and how plans, roles, limits and flags divide the work, is on its own page: `bridge guide fit-together`. In short: every gate in app code is a flag, and its rule says why (a privilege, a plan feature, a rollout).

## The whole integration

What a developer's repo holds once Bridge is in. Nothing else is required; every other page Bridge needs, it serves.

**Frontend (SvelteKit) — 15 lines in four files, plus one line of `.env`:**

```env
# .env
VITE_BRIDGE_APP_ID=your-app-id
```

```ts
// src/routes/+layout.ts
import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';
export const ssr = false;
export const load = bridgeBootstrap({ rules: [{ match: new RegExp('^/auth($|/)'), public: true }] });
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { BridgeBootstrap } from '@nebulr-group/bridge-svelte';
  import '@nebulr-group/bridge-svelte/styles';
  let { children } = $props();
</script>
<BridgeBootstrap>
  {@render children()}
</BridgeBootstrap>
```

```svelte
<!-- src/routes/auth/[...bridge]/+page.svelte — every sign-in page -->
<script lang="ts">
  import { BridgeAuthRoutes } from '@nebulr-group/bridge-svelte';
</script>
<BridgeAuthRoutes />
```

With plans, one more four-line file serves the subscription page, the paywall and both checkout return pages:

```svelte
<!-- src/routes/subscription/[...bridge]/+page.svelte -->
<script lang="ts">
  import { BridgeBillingRoutes } from '@nebulr-group/bridge-svelte';
</script>
<BridgeBillingRoutes />
```

**Backend (NestJS) — 4 lines, plus one line of environment.** The lines marked `// +` are Bridge's; the rest is what `nest new` already gave you:

```env
# .env
BRIDGE_APP_ID=your-app-id
```

```ts
// src/app.module.ts
import { Module } from '@nestjs/common';
import { BridgeModule } from '@nebulr-group/bridge-nestjs';                  // +
import { ExportsController } from './exports.controller';

@Module({
  imports: [BridgeModule.forRoot({ guard: { global: true } })],            // + every route needs a signed-in user
  controllers: [ExportsController],
})
export class AppModule {}
```

```ts
// src/exports.controller.ts
import { Controller, Post } from '@nestjs/common';
import { RequireQuota } from '@nebulr-group/bridge-nestjs';                  // +

@Controller('exports')
export class ExportsController {
  @Post()
  @RequireQuota('exports')                                                  // + the plan limit
  create() {
    return { exported: true };
  }
}
```

`BRIDGE_APP_ID` must be in the process environment. NestJS does not read `.env` by itself: start with `node --env-file=.env dist/main.js`, or set it in your container or process manager.

**Settings are read for you.** Each field resolves as *explicit option > environment > default*; an empty value counts as unset.

| Frontend | Backend | When to set it |
|---|---|---|
| `VITE_BRIDGE_APP_ID` | `BRIDGE_APP_ID` | Always. Missing, Bridge refuses to start and names the variable |
| `VITE_BRIDGE_API_BASE_URL` | `BRIDGE_API_BASE_URL` | Only for a non-production app (stage, local, self-hosted). Unset means production |
| `VITE_BRIDGE_HOSTED_URL` | — | Only for a local or self-hosted Bridge. On Bridge's own domains it follows the API address (`api-stage` → `auth-stage`) |
| `VITE_BRIDGE_DEBUG` | `BRIDGE_DEBUG` | `true` for console logging |

## 1. Decide once, where the action happens

Ask one question first: **does this action call your server?**

- **It calls your backend:** the backend handler counts it and refuses at the limit, because that is where the action happens. The frontend shows the count and the upgrade dialog, and does not count the same metric again.
- **It happens in the browser** and never reaches a server of yours (local-first, data on the device): the browser counts it and `<QuotaGate>` stops the button at the limit (section 5). That is a complete, first-class setup.

Never both for one metric: it would be counted twice.

## 2. A POST increments the limit

The backend decorator **is** the increment. There is nothing else to wire: no "report usage" call after the insert, no counter in your database, no endpoint for the frontend.

```ts
@Post()
@RequireQuota('exports')
create() { /* your code */ }
```

- **Before the handler:** at the plan's limit the request is refused with `402` and a body the frontend understands (`{ code: 'QUOTA_EXCEEDED', metric, used, limit, fix }`). Your handler never runs.
- **After the handler:** only when it answered **2xx**, Bridge records the use — exactly one write. A handler that throws or answers 4xx/5xx records nothing.
- **Retries:** a request that sends an `Idempotency-Key` header is counted once per key, however often the client retries.
- **Fail-closed:** if Bridge cannot answer, the request is refused with `503`, never let through unchecked.
- A `metered` quota never refuses: past its allowance it bills per unit.

## 3. Counter or gauge

**If deleting it frees room, it's a gauge and your app counts it; if it happened, it's a counter and Bridge counts it.**

| | Counter | Gauge |
|---|---|---|
| Examples | exports, API calls, AI completions, emails sent | tickets, projects, stored files, seats |
| Who counts | Bridge, one event per successful request | Your app — you pass your own count |
| Resets | every billing period ("40 of 100 this month") | never ("8 of 10 projects") |
| Configure | `bridge plan quota set <plan> --metric exports --limit 100 --policy hard` (counter is the default) | `bridge plan quota set <plan> --metric tickets --limit 10 --policy hard --kind gauge` |
| Backend | `@RequireQuota('exports')` | `@RequireQuota('tickets', { current })` on create, `@SyncQuota('tickets', { current })` on delete |

```ts
@Post()
@RequireQuota('tickets', { current: (t, self: TicketsController) => self.tickets.countFor(t.id) })
create() { /* … */ }

@Delete(':id')
@SyncQuota('tickets', { current: (t, self: TicketsController) => self.tickets.countFor(t.id) })
remove() { /* … */ }
```

`current` returns your own count, and that count is what the limit is compared against, so Bridge's copy heals itself if it ever missed an update. There is no decrement and no reservation: every create and delete sends the whole count.

**Seats** (`users`) are a gauge Bridge keeps itself from workspace membership. `@RequireQuota('users')` on your invite handler checks the seat limit and writes nothing.

`bridge plan quota list` shows every metric the app's plans limit, with its kind.

**Every hard quota is also an entitlement** with the same name, true while there is room. So never pair `@RequireEntitlement('exports')` with `@RequireQuota('exports')`: at the cap the entitlement answers `403` before the quota can answer the `402` the frontend knows how to upsell. `@RequireQuota` is for a *limit*; a plan *feature* (`analytics`, `sso`) is a flag (next paragraph).

**A plan feature goes in the plan's features list.** `bridge plan feature add pro analytics --name "Analytics"` makes `analytics` true on `pro`, and false on every other plan. The pricing table and the upgrade dialog name it from the same list. Control the feature with a flag whose rule is `bridge:billing.entitlement.analytics eq true` — `<FeatureFlag key="analytics">` or a route rule with `featureFlag` in the UI, `@RequireFeatureFlag('analytics')` on the backend — so changing what Pro sells is one edit on the plan and no flag rule has to follow. `app_active` is always there: true while the workspace's subscription is active, trialing, past due or cancelling at period end.

## 4. Three ways to handle a limit in the UI

Pick the lowest level that does the job. Each is optional; level 0 is on without code.

| Level | What the page writes | What the user sees |
|---|---|---|
| **0 — nothing** | a button calling your API with `bridgeFetch()`, as every authenticated call does | Your backend refuses at the cap (`402`), and `<BridgeBootstrap>` opens an **upgrade dialog** naming the metric, linking to the subscription page. A workspace member who cannot manage billing is told to ask the owner instead |
| **1 — one component** | `<QuotaGate metric="tickets">…</QuotaGate>` around the button; `<FeatureFlag key="analytics" upgrade>…</FeatureFlag>` around a paid feature | The button is disabled at a known hard cap with an upgrade line beside it; the paid feature shows on a plan that includes it, and elsewhere an "Upgrade to use this" button that opens the dialog when clicked |
| **2 — your own UI** | `useQuota('tickets')`, and `<FeatureFlag key="analytics">` around what the plan sells | Whatever you build from the live numbers |

```svelte
<script lang="ts">
  import { QuotaGate, FeatureFlag, useQuota } from '@nebulr-group/bridge-svelte';
  const tickets = useQuota('tickets');
</script>

<!-- level 1 -->
<QuotaGate metric="tickets">
  <button onclick={createTicket}>New ticket</button>
</QuotaGate>

<!-- the flag's rule: bridge:billing.entitlement.analytics eq true -->
<FeatureFlag key="analytics" defaultValue={false} upgrade>
  <a href="/analytics">Analytics</a>
</FeatureFlag>

<!-- level 2 -->
{#if tickets.loading}
  Loading…
{:else if tickets.unlimited}
  Unlimited tickets
{:else}
  {tickets.used} of {tickets.limit} tickets
{/if}
```

- "Not loaded yet" is never "zero" and never "not allowed": `useQuota` numbers stay `null` while `loading`, and `<QuotaGate>` stays enabled while loading.
- No upgrade dialog opens by itself: it opens on a `402` from your backend, when someone opens a route whose flag is off because of the plan, or when they click an upgrade prompt. A page that only renders a hidden feature opens nothing.
- Your app authenticates its own API calls with `bridgeFetch` anyway: a plain `fetch` sends no user token, so a protected backend answers `401`, never `402`. The limit handling still needs no code — the dialog opens from any `402 QUOTA_EXCEEDED` the wrapper sees. The dialog also catches a refusal from Bridge's own API; a backend on another origin called with plain `fetch` is listed in `billing.apiOrigins`. `billing: { upgradeDialog: false }` turns it off, `billing: { upgradeDialog: MyDialog }` replaces it.
- Do not write a quota `if`, a "limit reached" toast or a `/quota` endpoint of your own: level 0 already covers the refusal, and the frontend reads quota directly from Bridge.

## 5. Count usage once, where the action happens

Ask one question: **does the click call your server?**

- **Yes** — the backend handler that does the work counts it (bridge-nestjs `@RequireQuota` / `@SyncQuota`). The page only shows the number and the upgrade dialog; it does not report anything.
- **No** — the action happens in the browser (a local-first or mobile app, data on the device), so the browser counts it. This is a complete, first-class way to run limits:

```ts
import { bridge } from '@nebulr-group/bridge-svelte';

bridge.usage.report('exports');                        // a counter: it happened
await bridge.usage.set('projects', projects.length);   // a gauge: how many exist now
```

Put `<QuotaGate metric="exports">` around the button (section 4, level 1) so it stops at the limit, and the upgrade line sells the next plan.

Never both: counting the same action on each side counts it twice. In development the plugin warns once in the console when your backend and the page count the same metric (bridge-nestjs marks a counting response with `X-Bridge-Usage-Counted` outside production; nothing is sent or printed in production).

## 6. Four levels of customising Bridge's pages

The same ladder holds for the sign-in pages (`<BridgeAuthRoutes>`) and the subscription pages (`<BridgeBillingRoutes>`). Climb only as far as you need.

| Rung | What you do | What you own |
|---|---|---|
| **0 — nothing** | Bridge's pages render inside your own `+layout.svelte` | Your navigation, header and shell already surround them |
| **1 — tokens** | Set `--bridge-*` CSS variables in your CSS | Colours, radius, spacing |
| **2 — frame and heading** | Pass the `frame(page, children)` and `heading(page)` snippets | Everything around the form on every page, and each page's heading |
| **3 — take over one page** | Create that page's own route file, e.g. `src/routes/auth/login/+page.svelte` | That one page; SvelteKit prefers it over `[...bridge]`, every other page keeps working |
| **4 — headless** | Build your own UI on `getBridgeAuth()` | Everything |

```svelte
<!-- rung 2: src/routes/auth/[...bridge]/+page.svelte -->
<script lang="ts">
  import { BridgeAuthRoutes } from '@nebulr-group/bridge-svelte';
</script>

<BridgeAuthRoutes>
  {#snippet frame(page, children)}
    <main class="auth-card">{@render children()}</main>
  {/snippet}
  {#snippet heading(page)}
    <h1>{page === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
  {/snippet}
</BridgeAuthRoutes>
```

`heading` replaces only each page's main step (the login credentials step, the signup form, the set-password form); sub-steps such as "Reset your password" keep their own, so two headings never stack. There are no per-page snippets: to change more than frame and heading, take over the page (rung 3). A sign-in page you own navigates itself after sign-in: `<LoginForm onLogin={() => goto(readReturnTo($page.url) ?? '/')} />`.

**The token contract (rung 1).** These `--bridge-*` variables are the supported way to restyle every Bridge page and component. Set them in your own stylesheet on `:root`, or on a wrapper to theme one area. The plugin declares its defaults on `:where(:root)`, which has zero specificity, so your `:root` wins whichever stylesheet loads first.

| Token | Default | Styles |
|---|---|---|
| `--bridge-primary` | `#4f46e5` | Primary buttons, the selected tab and plan interval, the active workspace |
| `--bridge-primary-hover` | primary, 15% darker | Primary button hover |
| `--bridge-primary-fg` | `#ffffff` | Text on primary surfaces |
| `--bridge-primary-light` | primary at 10% | Tint behind the active workspace |
| `--bridge-input-focus` | primary | Input focus ring |
| `--bridge-bg` | `#ffffff` | Dialogs, menus, panels |
| `--bridge-foreground` | `#111827` | Text on those surfaces, workspace names |
| `--bridge-muted` | `#6b7280` | Secondary text, hints, table headings |
| `--bridge-muted-bg` | `#f3f4f6` | Subtle fills: tab tracks, hovers, the MFA backup code |
| `--bridge-border` | `#d1d5db` | Input, table, card and secondary button borders |
| `--bridge-border-radius` | `6px` | Corners of inputs, buttons, alerts, cards and dialogs |
| `--bridge-overlay` | `rgba(15, 23, 42, 0.45)` | Backdrop behind dialogs |
| `--bridge-alert-error-{bg,fg,border}` | `#fef2f2` / `#991b1b` / `#fca5a5` | Errors, critical billing notices, cancelled plan badge |
| `--bridge-alert-success-{bg,fg,border}` | `#f0fdf4` / `#166534` / `#86efac` | Confirmations, active plan badge |
| `--bridge-alert-info-{bg,fg,border}` | `#eff6ff` / `#1e40af` / `#bfdbfe` | Info notices, trial badge |
| `--bridge-alert-warning-{bg,fg,border}` | `#fffbeb` / `#92400e` / `#fcd34d` | Warnings, a quota nearing its limit, past-due badge |
| `--bridge-auth-page-padding` | `3rem 1rem` | Padding of the default sign-in page container |
| `--bridge-billing-page-width` | `60rem` | Width of the subscription pages and `<BridgePaywallPage>` |
| `--bridge-billing-page-padding` | `3rem 1rem` | Padding of the subscription pages and `<BridgePaywallPage>` |
| `--bridge-paywall-bg` | `rgba(15, 23, 42, 0.72)` | Backdrop of the `<BridgePaywall>` overlay and the billing lockscreen |
| `--bridge-paywall-panel-bg` | `--bridge-bg` | Panel of the `<BridgePaywall>` overlay |

The derived tokens (hover, light, focus) follow `--bridge-primary` wherever you set it, unless you set them too. Two older names still work as deprecated aliases: `--bridge-primary-foreground` for `--bridge-primary-fg`, and `--bridge-bg-muted` for `--bridge-muted-bg`. Fonts and body text colour are not tokens: Bridge pages render inside your layout and inherit them. With Tailwind, point the tokens at your theme (see [theming](/theming/)). Leaving out `import '@nebulr-group/bridge-svelte/styles'` makes the components headless: plain HTML for you to style.

## 7. Pages Bridge serves, and the one it only offers

- **Sign-in:** `src/routes/auth/[...bridge]/+page.svelte` serves login, signup, the OAuth callback, set password (where signup verification and password-reset emails land), forgot password, magic link, passkey setup and workspace selection. Which methods appear comes from the app's settings at runtime, so turning magic links on needs no code. Hosted and in-app sign-in use the same file; `loginRoute: '/auth/login'` in `bridgeBootstrap()` is the whole switch to in-app.
- **Subscription:** `src/routes/subscription/[...bridge]/+page.svelte` serves `/subscription`, the paywall `/subscription/plan`, and the checkout return pages `/subscription/success` and `/subscription/error`. Bridge's redirects and upgrade links point there by default.
- **The paywall** redirects a signed-in workspace with no plan to `/subscription/plan` before any page renders — only when the app has plans and its `paymentsAutoRedirect` setting is on (the default). `bridge app update --payments-auto-redirect false` turns it off.
- **A `/welcome` onboarding page is offered, never created unasked.** It is a product decision: ask the developer. Only if they say yes, add a one-line page rendering `<BridgePaywallPage />` and `billing: { paywallRoute: '/welcome' }` in `bridgeBootstrap()`.
- Any other address under a catch-all gets the app's own 404.

## Where the details live

- Sign-in: [hosted quickstart](/quickstart/hosted-quickstart/), [in-app quickstart](/sdk-auth/sdk-quickstart/), [route guards](/auth/securing/route-guards/)
- Plans and limits: [how billing works](/billing/how-it-works/), [usage limits](/billing/limits/usage-limits/), [lock features to a plan](/billing/limits/lock-features/), [report usage](/billing/limits/report-usage/)
- Styling: [theming](/theming/)
- The backend: the bridge-nestjs docs, "Plan limits"

## Exceptions

Checking a plan feature without a flag (`@RequireEntitlement` on the backend, `<Entitled>` or `$entitlements.can` in the UI) exists for the rare case where the developer explicitly asks for no flag. It prints a one-time note in development; mark the line `// bridge-gate-exception: <reason>` so `bridge check gates` leaves it.
