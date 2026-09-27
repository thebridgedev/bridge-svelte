# Bridge SvelteKit Integration

You are integrating The Bridge into a SvelteKit application. The whole integration is one `.env` line and three small files; the plugin serves every sign-in page itself. This guide sets up **hosted sign-in** (Bridge's login page, the default). For sign-in inside the app, read `bridge guide svelte sdk-auth` instead — it is the same files plus one config field.

`bridge guide mechanisms` explains the rules everything here builds on (the server decides limits, the three UI levels, the four customisation rungs). Read it when the developer asks for more than this guide covers.

## Decide first — hosted or in-app sign-in?

| You want | Mode | Config |
|---|---|---|
| The fastest path; Bridge owns the login UI | **Hosted** (default) — this guide | nothing |
| Login inside the app, the app's styling | **In-app (SDK auth)** — `bridge guide svelte sdk-auth` | `loginRoute: '/auth/login'` |

`loginRoute` in `bridgeBootstrap()` is the whole switch; the files are the same. If the developer has not said which they want, ask.

## Install

```bash
{pm} add @nebulr-group/bridge-svelte
```

Use the project's package manager (`bun add`, `pnpm add`, `yarn add`, `npm i`). Nothing else to install.

**Migrating from `@nebulr/nblocks-svelte`:** remove that package and any local tarball reference, rename `VITE_NBLOCKS_APP_ID` to `VITE_BRIDGE_APP_ID`, replace `<NblocksBootStrap>` with the layout below, and turn `PUBLIC_ROUTES` into `rules` (below). Do not carry the old public routes over: start with everything protected and let the developer open pages up.

## The files

**`.env`** — the app id from `bridge app get`:

```env
VITE_BRIDGE_APP_ID=your-app-id
# Only for a stage, local or self-hosted app:
# VITE_BRIDGE_API_BASE_URL=https://api-stage.thebridge.dev
```

**`src/routes/+layout.ts`**:

```ts
import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';

export const ssr = false;

export const load = bridgeBootstrap({
  rules: [{ match: new RegExp('^/auth($|/)'), public: true }],
});
```

**`src/routes/+layout.svelte`**:

```svelte
<script lang="ts">
  import { BridgeBootstrap } from '@nebulr-group/bridge-svelte';
  import '@nebulr-group/bridge-svelte/styles';

  let { children } = $props();
</script>

<BridgeBootstrap>
  {@render children()}
</BridgeBootstrap>
```

<<<<<<< HEAD
**Key points:**
- `BridgeBootstrap` renders its children only once Bridge is ready, so protected content never flashes. Write no ready-state logic of your own.
- `BridgeBootstrap` handles the OAuth callback automatically (detects `?code=` on the callback URL).
- Put your navigation and page shell inside it too (e.g. `<Nav />`, `<BridgeBillingNotice />`, `<main>`), so everything that reads Bridge state renders after Bridge is ready.
- **You must import `@nebulr-group/bridge-svelte/styles`** — this provides required structural CSS and visual defaults for Bridge components (login forms, alerts, buttons). Without it, Bridge UI elements will render unstyled and broken. If the project uses its own design system (e.g., Tailwind), you can override the visual defaults via CSS variables but the import must still be present.

## Serve the auth pages (the OAuth callback)

SvelteKit needs a route for the callback URL, or it answers 404 before `bridgeBootstrap` can exchange the code. Create `src/routes/auth/[...bridge]/+page.svelte`:
=======
**`src/routes/auth/[...bridge]/+page.svelte`**:
>>>>>>> origin/feature/mcp-journey

```svelte
<script lang="ts">
  import { BridgeAuthRoutes } from '@nebulr-group/bridge-svelte';
</script>

<BridgeAuthRoutes />
```

<<<<<<< HEAD
In hosted mode this file serves `/auth/oauth-callback`: `bridgeBootstrap` exchanges the code in the layout `load` and redirects before the page renders, so nothing flashes. Every other sign-in address under `/auth` (`/auth/login`, `/auth/signup`, …) shows a short page saying sign-in is hosted, with a button to the hosted login — useful for old bookmarks and emailed links. Any other address under `/auth` gets your app's 404.

It is the same file an in-app (SDK auth) app uses, so switching to in-app login later is a config change (`loginRoute`), not new pages.
=======
That is the integration. What each piece does:
>>>>>>> origin/feature/mcp-journey

- **Settings are read for you.** Bridge reads `VITE_BRIDGE_APP_ID`, `VITE_BRIDGE_API_BASE_URL`, `VITE_BRIDGE_HOSTED_URL` and `VITE_BRIDGE_DEBUG` itself. Each field resolves as *explicit option > environment > default*, so `bridgeBootstrap({ appId: 'other', rules })` wins over `.env`. With no app id anywhere Bridge refuses to start and names `VITE_BRIDGE_APP_ID`. Without `VITE_BRIDGE_API_BASE_URL` it talks to production, and a development build warns once in the console; the hosted login address follows the API address on Bridge's own domains, so only a local or self-hosted Bridge sets `VITE_BRIDGE_HOSTED_URL`.
- **`ssr = false`** is required: Bridge runs in the browser.
- **Everything is protected by default.** Only `/auth/*` must be public; the rules above say so.
- **`<BridgeBootstrap>`** renders the app only once Bridge is ready (so protected content never flashes), finishes the OAuth callback, starts feature flags and live updates, and opens the upgrade dialog when your backend refuses a request at a plan limit. Write no ready-state logic of your own; put your navigation and shell inside it.
- **The styles import** gives the Bridge components their structure and default look. Keep it even with Tailwind or a design system; restyle through the `--bridge-*` tokens.
- **The `[...bridge]` file** serves `/auth/oauth-callback` (the code is exchanged in the layout `load`, before the page renders). Every other sign-in address under `/auth` shows a short "sign-in is hosted" page with a button to the login, for old bookmarks and emailed links. Any other address under `/auth` gets the app's own 404. It is the same file in-app sign-in uses, so switching later is one config field, not new pages.

## Configure the Bridge app

The app must accept the callback URL and the frontend's origin:

```bash
bridge app update \
  --ui-url http://localhost:5173 \
  --default-callback-uri http://localhost:5173/auth/oauth-callback \
  --redirect-uris http://localhost:5173/auth/oauth-callback \
  --allowed-origins http://localhost:5173
```

Use the real dev URL (and later the production domain). `bridge app redirect-uris add <url>` adds one callback without replacing the list. Allowed origins are more than CORS: from an origin that is not listed, in-app sign-in answers `403 {"message":"Origin not allowed"}`. Add every origin the app is served from, each dev port included. Without the CLI: Bridge admin → **Authentication** → **Security** → **Allowed Origins**.

## Sign in and out

```svelte
<script lang="ts">
  import { auth, isAuthenticated, profileStore } from '@nebulr-group/bridge-svelte';
</script>

{#if $isAuthenticated}
  <span>{$profileStore?.fullName ?? $profileStore?.email}</span>
  <button onclick={() => auth.logout()}>Log out</button>
{:else}
  <button onclick={() => auth.login()}>Log in</button>
{/if}
```

A signed-out visitor on a protected page is sent to the login and brought back to that page afterwards; the button is only for pages that are public. `profileStore` **is** the store: use `$profileStore`, never `const { profile } = profileStore` (that `profile` is `undefined`, so nothing renders).

**Route rules.** `match` takes a string (exact, or with `*`: `'/docs/*'`) or a `RegExp`; the first match wins. `public: true` opens a page. `featureFlag: 'key'` plus `redirectTo` hides a page unless the flag is on. The rules decide what the browser renders; they are not authorization — your API still verifies the token.

## Reading state

<<<<<<< HEAD
**Config structure:**

```ts
export const load = bridgeBootstrap({
  rules: [
    // Required — auth callback must be accessible
    { match: new RegExp('^/auth($|/)'), public: true },

    // Optional — add public routes as needed later, e.g.:
    // { match: '/', public: true },
    // { match: new RegExp('^/search'), public: true },

    // Feature-gated routes — require login + feature flag
    // { match: '/beta*', featureFlag: 'beta-access', redirectTo: '/' },
  ],
  defaultAccess: 'protected',  // everything requires login unless listed above
});
```

**Rule matching:**
- `match` accepts a string or a `RegExp`. A string is an **exact** path match unless it contains `*` (`'/beta/*'` matches everything under `/beta/`); the first matching rule wins.
- `public: true` allows unauthenticated access.
- `featureFlag` requires the user to be logged in AND have the flag enabled.
- `redirectTo` specifies where to send a signed-in user who doesn't meet the `featureFlag` requirement (defaults to `/`). A signed-out visitor on a protected route always goes to login.

**When an unauthenticated user hits a protected route:**
- They are redirected to the Bridge hosted login page.
- After login, they are returned to the app's callback URL, then redirected to the page they originally asked for (or `/` when there was none).

**What the guard covers:** `bridgeBootstrap()` re-evaluates the route rules on every navigation — the first page load, client-side navigations, and redirects thrown from your own `load` functions (e.g. a public `/` whose `+page.ts` redirects into the app). If it cannot reach a decision (network error, broken config) it denies protected routes. For defence in depth on a sensitive page, also call `assertAuthorized(url)` from that page's own `load` (exported from `@nebulr-group/bridge-svelte`). Route guards control what the browser renders; they are **not** authorization — your API must still verify the user's token.

**Default: protect everything.** The only route that must be public is `/auth/*` (the OAuth callback lives there). All other routes should be protected by default. The user can relax this later for specific pages (landing, search, docs, etc.) using the CLI or by editing the route config directly.

**Detecting existing public route config:**
- If the app has an existing public route config (e.g., `PUBLIC_ROUTES` array), do NOT carry those over automatically. Start with everything protected and let the user decide what to open up.
  
## Environment variables

Add to your `.env` file (or `.env.local` for local dev):

```env
VITE_BRIDGE_APP_ID=your-app-id-here
# Only for a non-production app (stage, local, self-hosted):
# VITE_BRIDGE_API_BASE_URL=https://api-stage.thebridge.dev
# Only for a local or self-hosted Bridge (stage's hosted pages follow the API address):
# VITE_BRIDGE_HOSTED_URL=http://localhost:3091
```

Bridge reads these variables itself — you do not pass them anywhere. Anything you pass to `bridgeBootstrap()` explicitly wins over the environment, and the environment wins over the default.

| Variable | Config field | Default when unset | Description |
|----------|-------------|--------------------|-------------|
| `VITE_BRIDGE_APP_ID` | `appId` (required) | — Bridge refuses to start and names this variable | Your Bridge application ID |
| `VITE_BRIDGE_API_BASE_URL` | `apiBaseUrl` | `https://api.thebridge.dev` (production) | Bridge API base URL — set it for any non-production app |
| `VITE_BRIDGE_HOSTED_URL` | `hostedUrl` | follows the API address on Bridge's own domains (`api-stage` → `auth-stage`), else `https://auth.thebridge.dev` | Bridge hosted UI URL (login page) — set it only for a local or self-hosted Bridge |
| `VITE_BRIDGE_DEBUG` | `debug` | `false` | `true` enables debug logging in the console |

A production app sets only `VITE_BRIDGE_APP_ID`. In a development build, an app id with no `VITE_BRIDGE_API_BASE_URL` logs one console warning saying production is in use — if you see it for a stage or local app, set the variable.

## Accessing user context

After login, user and tenant information is available via stores:

```svelte
<script lang="ts">
  import { profileStore, isAuthenticated } from '@nebulr-group/bridge-svelte';
</script>

{#if $isAuthenticated}
  <p>Welcome, {$profileStore?.fullName}</p>
  <p>Email: {$profileStore?.email}</p>
  <p>Tenant: {$profileStore?.tenant?.name}</p>
{/if}
```

**Available stores:**
- `isAuthenticated` — `Readable<boolean>`
- `profileStore` — `Readable<{ fullName, email, tenant, onboarded, ... } | null | undefined>` (the store itself — use `$profileStore`; `undefined` while loading, `null` when signed out)
- `tokenStore` — `Readable<{ accessToken, refreshToken, idToken } | null>`
- `authState` — `Readable<'unauthenticated' | 'authenticated' | 'tenant-selection' | ...>`

For feature flags, read them via the Feature Flags 2.0 surface — `useFlag(() => key, defaultValue)` (reactive rune) or `<FeatureFlag key="..." defaultValue={...}>` (component), both from `@nebulr-group/bridge-svelte/flags`:

```svelte
<script lang="ts">
  import { useFlag } from '@nebulr-group/bridge-svelte/flags';

  const newDashboard = useFlag(() => 'new_dashboard', false);
</script>

{#if newDashboard.value}
  <NewDashboard />
{/if}
```

## Authenticated API calls to your backend

Once your backend is protected with Bridge auth guards, your frontend needs to send the user's access token on API requests. Bridge handles its own API calls internally — this is only for calls to **your own backend**.

Use `bridgeFetch` — `fetch` with the user's access token attached, and one refresh-and-retry when your backend answers `401`. Same signature as `fetch`; do not write your own `fetchWithAuth`.

```ts
import { bridgeFetch } from '@nebulr-group/bridge-svelte';

const res = await bridgeFetch('/api/projects', { method: 'POST', body: JSON.stringify(input) });
```

**With `urql` (GraphQL):** hand it to the client as its `fetch`.

```ts
import { bridgeFetch } from '@nebulr-group/bridge-svelte';

const client = createClient({ url: '/graphql', fetch: bridgeFetch });
```

It sends the user's token to the URL you give it, so use it for **your** backend only — never for a third-party URL.

For an HTTP client that takes no `fetch` option (axios and similar), read the token from `tokenStore` at request time and set the `Authorization: Bearer` header yourself. Public endpoints (e.g., card search) don't need the header.

## Integration checklist

Before verifying, confirm every item was applied. Do not skip any:

- [ ] Old auth package removed (`@nebulr/nblocks-svelte` or equivalent) and any local tarballs deleted
- [ ] `@nebulr-group/bridge-svelte` installed using the project's package manager
- [ ] `src/routes/+layout.ts` — `export const load = bridgeBootstrap({ rules, defaultAccess })`
- [ ] `src/routes/+layout.ts` — exports `ssr = false`
- [ ] `src/routes/+layout.ts` — `defaultAccess` is `'protected'`, only `/auth/*` is public
- [ ] `src/routes/+layout.svelte` — wraps the app in `<BridgeBootstrap>…</BridgeBootstrap>` (no `ready` flag of your own)
- [ ] `src/routes/+layout.svelte` — imports `@nebulr-group/bridge-svelte/styles`
- [ ] `src/routes/auth/[...bridge]/+page.svelte` — file exists and renders `<BridgeAuthRoutes />` (serves the OAuth callback)
- [ ] Bridge app configured: `redirect-uris` includes the callback URL, `allowed-origins` includes the frontend origin
- [ ] Login/logout buttons added to nav using `auth.login()` and `auth.logout()`
- [ ] User display using `isAuthenticated` store and `profileStore`
- [ ] `VITE_BRIDGE_APP_ID` set in the `.env` file (plus `VITE_BRIDGE_API_BASE_URL` for a stage or local app)
- [ ] Calls to protected backend endpoints go through `bridgeFetch` (no hand-written auth fetch helper)
- [ ] Old env vars removed (`VITE_NBLOCKS_APP_ID`, etc.)
- [ ] Old auth imports and route config removed (e.g., `PUBLIC_ROUTES` array)

## Verify the integration

After completing the setup:

1. **Build check:** Run the project's build command. There should be no TypeScript or import errors.
2. **Dev server check:** Start the dev server. The app should load without console errors.
3. **Protected route check:** Navigate to a protected route — you should be redirected to the Bridge login page.
4. **Public route check:** Navigate to `/auth/*` — it should render without redirect.
5. **Login check:** Log in via Bridge — you should be returned to the app and see user info.
6. **Styles check:** Bridge UI components (if any render) should have proper styling — not raw unstyled HTML.

---

## Unified `bridge` surface (Live Channel Unification — recommended for new code)

Phase 4 of the Live Channel Unification milestone introduces a single scoped read surface. **Use this for new code instead of reaching for individual stores like `subscriptionStore`, `getBridgeAuth().getProfile()`, etc.** The legacy exports still work for one minor with a one-time deprecation warning; they're removed in the next.

### Three scopes, one object

```ts
import { bridge } from '@nebulr-group/bridge-svelte';

// app — anything tied to the app config (whitelabel, plan catalog, flag defs)
bridge.app.branding              // Readable<BrandingSnapshot | null>
bridge.app.plans                 // LazySlice<Plan[]>  ← await it, or .load()

// tenant — anything tied to the workspace/tenant
bridge.tenant.id                 // Readable<string | null>
bridge.tenant.name               // Readable<string | null>
bridge.tenant.subscription       // Readable<SubscriptionSnapshot | null>
bridge.tenant.entitlements       // { can(key): boolean, snapshot: Readable<...> }

// user — anything tied to the authenticated user
bridge.user                      // Readable<UserSnapshot | null>  // { id, email, role, tenantId }
```

### How data lands

- **Snapshot slices** (`app.branding`, `tenant.{id,name,subscription,entitlements}`, `user`) are pushed by the server in a single `session.snapshot` message the moment the per-user channel subscribes. First paint reflects real state — no flicker, no per-slice REST hydrate.
- **Lazy slices** (`app.plans` today; more coming in TBP-359) start `null` and populate on first `.load()` or `await`:

  ```ts
  const plans = await bridge.app.plans;             // thenable sugar
  const plans = await bridge.app.plans.load();      // explicit
  $: $bridge.app.plans                              // Svelte store; null until loaded
  ```

- **Reconnect** re-emits the snapshot; lazy slices that were loaded keep their values and update via channel deltas (no automatic refetch).

### Reading entitlements

```svelte
<script lang="ts">
  import { entitlements } from '@nebulr-group/bridge-svelte';
</script>

{#if $entitlements.ready && $entitlements.can('ai_completions')}
  <FeatureUI />
{/if}
```

`$entitlements.can(key)` is fail-closed and live: it follows the latest snapshot and every `entitlements.changed` push. `$entitlements.ready` is `false` until Bridge has answered — check it before treating a `false` as "this plan cannot". Outside a component, `bridge.tenant.entitlements.can(key)` is the same answer, read once. For quota numbers use `useQuota(metric)` (see the billing guide).

In markup, `<Entitled to="ai_completions">…{#snippet fallback()}…{/snippet}</Entitled>` is the same check with the `ready` handling built in. Plan limits need no code at all: when your backend refuses a request at a cap (`402 QUOTA_EXCEEDED` from bridge-nestjs's `@RequireQuota`), `<BridgeBootstrap>` opens an upgrade dialog; `<QuotaGate metric>` disables an action before the click. All of it is decoration — the backend enforces. See the billing guide, Step 3.

### Using in components

Import the `bridge` singleton from `@nebulr-group/bridge-svelte` wherever you need it — components, `.svelte.ts` modules or plain `.ts` files. Its scopes are Svelte stores, so use `$` in templates (for example `const subscription = bridge.tenant.subscription;` then `$subscription?.plan?.slug`). No provider or context wiring is needed beyond the `<BridgeBootstrap>` already in your root layout.

`useBridge()` (also exported) returns the same `bridge` object; a parent component can override it for its children with `setBridgeContext(fixture)` — for tests and Storybook, never needed in an app.

### Mapping from legacy exports

| Legacy (deprecated) | Unified surface |
=======
| You need | Use |
>>>>>>> origin/feature/mcp-journey
|---|---|
| Signed in? | `$isAuthenticated` |
| The user | `$profileStore` (`undefined` while loading, `null` when signed out) |
| The access token for a client that takes no `fetch` (axios) | `$tokenStore?.accessToken` |
| Workspace, subscription, branding, live | the `bridge` object: `bridge.tenant.subscription`, `bridge.app.branding`, `bridge.user` (Svelte stores) |
| What the plan allows | `$entitlements.can('key')` after `$entitlements.ready`; `<Entitled to="key">` in markup |
| A feature flag | `useFlag(key, default)` / `<FeatureFlag>` from `@nebulr-group/bridge-svelte/flags` — `bridge guide svelte feature-flags` |

## Calling your own backend

```ts
import { bridgeFetch } from '@nebulr-group/bridge-svelte';

const res = await bridgeFetch('/api/projects', { method: 'POST', body: JSON.stringify(input) });
```

`bridgeFetch` is `fetch` with the user's token attached and one refresh-and-retry on `401`. Hand it to a GraphQL client as its `fetch` (`createClient({ url: '/graphql', fetch: bridgeFetch })`). Use it for **your** backend only, never a third-party URL. Do not write a `fetchWithAuth` helper.

## Everything else the package exports

Reach for these before writing an equivalent; each is imported from `@nebulr-group/bridge-svelte`.

| Component | Does | Guide |
|---|---|---|
| `BridgeAuthRoutes`, `LoginForm`, `SignupForm`, `ForgotPassword`, `MagicLink`, `PasskeyLogin`, `PasskeySetup`, `PasskeyRequestSetupLink`, `MfaChallenge`, `MfaSetup`, `SsoButton`, `WorkspaceSelector`, `TenantSelector` | Sign-in pages and their building blocks | `bridge guide svelte sdk-auth` |
| `BridgeBillingRoutes`, `BridgePaywallPage`, `BridgePaywall`, `PlanSelector`, `BillingPortalButton`, `BridgeBillingNotice`, `BridgeSubscriptionStatus` | Subscription pages, paywall, plan picker, portal button, lifecycle notices, a plan/status badge | `bridge guide svelte billing` |
| `QuotaGate`, `Entitled`, `BridgeQuotaBanner`, `BridgeUpgradeDialog` | Plan limits and features in the UI | `bridge guide svelte billing` |
| `TeamManagementPanel`, `TeamUserList`, `TeamProfileForm`, `TeamWorkspaceForm`, `TeamAddUserDialog`, `TeamEditUserDialog`, `TeamConfirmDialog`, `TeamUserActionsMenu` | Members, roles, workspace settings | `bridge guide svelte team` |
| `ApiTokenManagement` | Lets a workspace create and revoke its API tokens | — |
| `FeatureFlag` | Markup behind a flag | `bridge guide svelte feature-flags` |
| `RealtimeDevBadge` | The "Live updates off — why?" badge; `<BridgeBootstrap>` already mounts it in dev builds | — |

## Checklist

- [ ] `@nebulr-group/bridge-svelte` installed; old auth packages, env vars and route config removed
- [ ] `.env` has `VITE_BRIDGE_APP_ID` (plus `VITE_BRIDGE_API_BASE_URL` for a stage or local app)
- [ ] `src/routes/+layout.ts`: `ssr = false` and `export const load = bridgeBootstrap({ rules })`, only `/auth/*` public
- [ ] `src/routes/+layout.svelte`: styles imported, app inside `<BridgeBootstrap>`, no `ready` flag of your own
- [ ] `src/routes/auth/[...bridge]/+page.svelte` renders `<BridgeAuthRoutes />`, and no other page under `src/routes/auth/` only renders a Bridge component
- [ ] Bridge app: callback URL in redirect URIs, every dev origin in allowed origins
- [ ] Calls to the app's own backend go through `bridgeFetch`

## Verify

1. The build passes with no type or import errors.
2. Signed out, a protected page redirects to the Bridge login; after signing in you land back on that page and see the user's name.
3. `/auth/login` shows the "sign-in is hosted" page; `/auth/not-a-page` shows the app's 404.
4. Bridge components render styled, not as raw HTML.
5. To prove sign-in without a browser: `bridge test-user create`, then `bridge test-user verify` with the credentials it printed.
