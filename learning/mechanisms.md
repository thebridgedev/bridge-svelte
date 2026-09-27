# How Bridge works

The rules every Bridge guide builds on, on one page: what the smallest integration is, who enforces a plan limit, the three ways to show a limit in the UI, and the four levels of customising Bridge's pages. Coding agents get the same page from `bridge guide mechanisms`.

The frontend examples are SvelteKit (`@nebulr-group/bridge-svelte`); the backend examples are NestJS (`@nebulr-group/bridge-nestjs`).

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

## 1. The server decides; the client decorates

Anyone can call your API with curl, so a limit or a paid feature is enforced on the backend handler, never in the browser. Everything the frontend shows about limits — the upgrade dialog, a disabled button, a hidden panel — explains or anticipates a decision the server already makes. Remove every frontend check and the product is still correct; remove the backend decorator and it is not.

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

**Every hard quota is also an entitlement** with the same name, true while there is room. So never pair `@RequireEntitlement('exports')` with `@RequireQuota('exports')`: at the cap the entitlement answers `403` before the quota can answer the `402` the frontend knows how to upsell. Use `@RequireEntitlement` for a plan *feature* (`analytics`, `sso`), `@RequireQuota` for a *limit*.

**A plan feature is a hard quota nothing counts.** There is no separate entitlement setting: `bridge plan quota set pro --metric analytics --limit 1 --policy hard` makes `analytics` true on `pro`, and a plan without that quota answers false. Gate it with `@RequireEntitlement('analytics')` on the backend and `<Entitled to="analytics">` in the UI. `app_active` is always there: true while the workspace's subscription is active, trialing, past due or cancelling at period end.

## 4. Three ways to handle a limit in the UI

Pick the lowest level that does the job. Each is optional; level 0 is on without code.

| Level | What the page writes | What the user sees |
|---|---|---|
| **0 — nothing** | a button calling your API with `bridgeFetch()`, as every authenticated call does | Your backend refuses at the cap (`402`), and `<BridgeBootstrap>` opens an **upgrade dialog** naming the metric, linking to the subscription page. A workspace member who cannot manage billing is told to ask the owner instead |
| **1 — one component** | `<QuotaGate metric="tickets">…</QuotaGate>` around the button; `<Entitled to="analytics">…</Entitled>` around a paid feature | The button is disabled at a known hard cap with an upgrade line beside it; the paid feature shows only on a plan that grants it |
| **2 — your own UI** | `useQuota('tickets')` and `$entitlements.can('analytics')` | Whatever you build from the live numbers |

```svelte
<script lang="ts">
  import { QuotaGate, Entitled, useQuota } from '@nebulr-group/bridge-svelte';
  const tickets = useQuota('tickets');
</script>

<!-- level 1 -->
<QuotaGate metric="tickets">
  <button onclick={createTicket}>New ticket</button>
</QuotaGate>

<Entitled to="analytics">
  <a href="/analytics">Analytics</a>
  {#snippet fallback()}<a href="/subscription">Upgrade for analytics</a>{/snippet}
</Entitled>

<!-- level 2 -->
{#if tickets.loading}
  Loading…
{:else if tickets.unlimited}
  Unlimited tickets
{:else}
  {tickets.used} of {tickets.limit} tickets
{/if}
```

- "Not loaded yet" is never "zero" and never "not allowed": `useQuota` numbers stay `null` while `loading`, `<QuotaGate>` stays enabled while loading, and `<Entitled>` renders nothing (or its `loading` snippet) until `$entitlements.ready`.
- Your app authenticates its own API calls with `bridgeFetch` anyway: a plain `fetch` sends no user token, so a protected backend answers `401`, never `402`. The limit handling still needs no code — the dialog opens from any `402 QUOTA_EXCEEDED` the wrapper sees. The dialog also catches a refusal from Bridge's own API; a backend on another origin called with plain `fetch` is listed in `billing.apiOrigins`. `billing: { upgradeDialog: false }` turns it off, `billing: { upgradeDialog: MyDialog }` replaces it.
- Do not write a quota `if`, a "limit reached" toast or a `/quota` endpoint of your own: level 0 already covers the refusal, and the frontend reads quota directly from Bridge.

## 5. Usage reported from the browser trusts the client

An app with no backend that sees the action — local-first, mobile, data on the device — can report usage from the frontend:

```ts
import { bridge } from '@nebulr-group/bridge-svelte';

bridge.usage.report('exports');                        // a counter: it happened
await bridge.usage.set('projects', projects.length);   // a gauge: how many exist now
```

This is **self-reported, trusted-client usage**. Anything in a browser can send any number, so **a frontend alone cannot enforce a limit**: Bridge shows and bills what the client reports, and the client can lie. When the app has a backend, report and enforce there (section 2). Use the browser path only when there is no server to do it.

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

**The token contract (rung 1).** These `--bridge-*` variables are the supported way to restyle the components; each has a built-in default. Set them on `:root` or on any wrapper.

| Token | Default | Styles |
|---|---|---|
| `--bridge-primary` | `#4f46e5` | Primary buttons, selected plan interval, active workspace border |
| `--bridge-primary-hover` | `#4338ca` | Primary button hover |
| `--bridge-primary-fg` | `#ffffff` | Text on primary buttons |
| `--bridge-primary-foreground` | `#ffffff` | Workspace avatar text; plan picker fallback when `--bridge-primary-fg` is unset |
| `--bridge-primary-light` | `#eff6ff` | Active workspace background |
| `--bridge-border` | `#d1d5db` | Input and secondary button borders |
| `--bridge-border-radius` | `6px` | Corners of inputs, buttons, alerts, cards |
| `--bridge-input-focus` | `#4f46e5` | Input focus ring |
| `--bridge-foreground` | `#374151` | Password-toggle hover, workspace names |
| `--bridge-muted` | `#6b7280` | Secondary text, hints, table headings |
| `--bridge-bg` | `#ffffff` | Plan-change confirmation panel |
| `--bridge-bg-muted` | `#f5f5f5` | MFA backup code |
| `--bridge-muted-bg` | `#f3f4f6` | Workspace list hover, plan interval tabs (which fall back to `--bridge-bg-muted`) |
| `--bridge-alert-error-bg` | `#fef2f2` | Error alert background |
| `--bridge-alert-error-fg` | `#991b1b` | Error alert text |
| `--bridge-alert-error-border` | `#fca5a5` | Error alert border |
| `--bridge-alert-success-bg` | `#f0fdf4` | Success alert background |
| `--bridge-alert-success-fg` | `#166534` | Success alert text |
| `--bridge-alert-success-border` | `#86efac` | Success alert border |
| `--bridge-auth-page-padding` | `3rem 1rem` | Padding of the default sign-in page container |
| `--bridge-billing-page-width` | `60rem` | Width of the subscription pages and `<BridgePaywallPage>` |
| `--bridge-billing-page-padding` | `3rem 1rem` | Padding of the subscription pages and `<BridgePaywallPage>` |
| `--bridge-paywall-bg` | `rgba(15, 23, 42, 0.72)` | Backdrop of the `<BridgePaywall>` overlay |
| `--bridge-paywall-panel-bg` | `#ffffff` | Panel of the `<BridgePaywall>` overlay |

All default rules use `:where()`, so any selector of yours wins without `!important`. Leaving out `import '@nebulr-group/bridge-svelte/styles'` makes the components headless: plain HTML for you to style.

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
