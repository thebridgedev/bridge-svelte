# Bridge SvelteKit Integration — Redirect Auth

You are integrating The Bridge into a SvelteKit application using the **redirect-based (hosted) auth flow**. Users are redirected to the Bridge hosted login page and returned to the app after authentication.

## Decide first — which login surface?

This decision shapes everything else. Make it before writing code; getting it wrong means rewriting the auth pages.

| You want | Use | What you build |
|---|---|---|
| The fastest path; Bridge owns the login UI | **Hosted auth** (default) — **this guide** | Nothing — no login page |
| Login inside your app, your styling | **SDK auth** | Your own routes rendering `LoginForm`, `SignupForm` etc. — `get_integration_guide` with `topic=sdk-auth` |

**Setting `loginRoute` in `BridgeConfig` is the entire switch.** Without it you get hosted; with it the route guard sends unauthenticated users to your own page instead of the Bridge hosted login. If you are being redirected to a route you never built, that field is why.

If the user has not said which they want, ask.

## Prerequisites

- **appId** — your Bridge application ID. Get it from `bridge app get` or the Bridge dashboard.
- **Package manager** — use whatever the project already uses (check for `bun.lock`, `pnpm-lock.yaml`, `yarn.lock`, or `package-lock.json`).

## Migration check

Before starting, check if the project has existing auth:

**Migrating from `@nebulr/nblocks-svelte`:**

| Old (nblocks-svelte) | New (bridge-svelte) |
|---|---|
| `@nebulr/nblocks-svelte` package | `@nebulr-group/bridge-svelte` package |
| `<NblocksBootStrap>` component | `<BridgeBootstrap>` component |
| `PUBLIC_ROUTES` array of strings/regexps | `RouteGuardConfig` with `rules` array and `defaultAccess` |
| `VITE_NBLOCKS_APP_ID` env var | `VITE_BRIDGE_APP_ID` env var |
| `onBootstrapComplete` callback + your own `ready` flag | `<BridgeBootstrap>` wraps your app and renders it once ready — no callback needed |
| `featureFlagProtections` prop | `RouteGuardConfig` rules with `featureFlag` field |

**Migration steps:**
1. Remove the old package: `{pm} remove @nebulr/nblocks-svelte`
2. Delete any local tarball or `nebulr-core/project-templates/` references in package.json
3. Install the new package (see Install section)
4. Replace component usage as shown below
5. Convert `PUBLIC_ROUTES` to `RouteGuardConfig` format (see Route protection)
6. Update environment variables

**If no existing auth is found:** skip migration steps, proceed directly to Install.

## Install

```bash
{pm} add @nebulr-group/bridge-svelte
```

Replace `{pm}` with the project's package manager (`bun add`, `pnpm add`, `yarn add`, or `npm i`).

No peer dependencies are required for the redirect auth flow.

## Wire the root layout load function

Create or update `src/routes/+layout.ts`:

```ts
import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';

export const ssr = false;

export const load = bridgeBootstrap({
  rules: [
    { match: new RegExp('^/auth($|/)'), public: true },
  ],
  defaultAccess: 'protected',
});
```

**Key points:**
- That one call is the whole wiring. Bridge reads the app id from `VITE_BRIDGE_APP_ID` and, for a stage or local app, the API address from `VITE_BRIDGE_API_BASE_URL` (see Environment variables).
- Anything you pass explicitly wins over the environment, and the environment wins over the built-in default — e.g. `bridgeBootstrap({ appId: 'other-app', rules })`.
- With no app id anywhere, Bridge refuses to start and names the missing `VITE_BRIDGE_APP_ID` instead of guessing.
- `ssr = false` is required — Bridge auth is client-side only.
- `defaultAccess: 'protected'` means all routes require login unless marked `public`.
- `/auth/*` must be public so the OAuth callback route is accessible.

## Wire the root layout component

Create or update `src/routes/+layout.svelte`:

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

**Key points:**
- `BridgeBootstrap` renders its children only once Bridge is ready, so protected content never flashes. Write no ready-state logic of your own.
- `BridgeBootstrap` handles the OAuth callback automatically (detects `?code=` on the callback URL).
- Put your navigation and page shell inside it too (e.g. `<Nav />`, `<BridgeBillingNotice />`, `<main>`), so everything that reads Bridge state renders after Bridge is ready.
- **You must import `@nebulr-group/bridge-svelte/styles`** — this provides required structural CSS and visual defaults for Bridge components (login forms, alerts, buttons). Without it, Bridge UI elements will render unstyled and broken. If the project uses its own design system (e.g., Tailwind), you can override the visual defaults via CSS variables but the import must still be present.

## Create the OAuth callback route

SvelteKit requires an actual route file for the callback URL. Without it, SvelteKit throws a 404 before `BridgeBootstrap` can handle the code exchange.

Create an empty `src/routes/auth/oauth-callback/+page.svelte`:

```svelte
```

The file must exist but should be empty. `BridgeBootstrap` intercepts this route in the layout `load` function, exchanges the code for tokens, and redirects to `/` before this page ever renders. If the file doesn't exist, SvelteKit will 404 before the load function runs.

## Configure the Bridge app (redirect URIs and allowed origins)

The Bridge app must know your frontend's callback URL and origin, otherwise it will reject the OAuth redirect and block CORS requests.

Run these commands using the Bridge CLI (or update via the dashboard):

```bash
# Set the frontend URL, callback URI, and allowed origins
bridge app update \
  --ui-url http://localhost:3000 \
  --default-callback-uri http://localhost:3000/auth/oauth-callback \
  --redirect-uris http://localhost:3000/auth/oauth-callback \
  --allowed-origins http://localhost:3000
```

**What each field does:**
- `--ui-url` — your frontend's base URL (used for email links and redirects)
- `--default-callback-uri` — where Bridge redirects after login by default
- `--redirect-uris` — allowlist of valid OAuth callback URIs (must include your callback URL)
- `--allowed-origins` — allowlist of origins for CORS (must include your frontend's origin)

**Replace `http://localhost:3000`** with your actual frontend URL. For production, use your real domain.

If the Bridge CLI is not available, these values can also be set in the Bridge admin dashboard — allowed origins are under **Authentication** → **Security** tab → **Allowed Origins** — or directly in the database (`apps` collection: `redirectUris`, `allowedOrigins`, `defaultCallbackUri`, `uiUrl` fields).

Allowed origins is more than CORS: for in-app (SDK) auth, an origin that is not listed gets `403 {"message":"Origin not allowed"}` on sign-in itself — password sign-in and the token exchange that finishes magic-link, passkey and MFA sign-in — plus signup and passkeys. Sending a magic link still succeeds, so the failure shows up after the link is clicked. Add every origin the app is served from, each dev port included.

## Add login and logout

The redirect flow uses `auth.login()` to send the user to the hosted Bridge login page, and `auth.logout()` to clear the session.

Add buttons to your navigation or header component:

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

**How it works:**
- `auth.login()` redirects to the Bridge hosted login page. After login, the user is redirected back to your app's callback URL (default: `{origin}/auth/oauth-callback`).
- `auth.logout()` clears tokens and redirects to the Bridge hosted logout page. **In SDK mode** (`loginRoute` configured), pass `redirectTo` explicitly so the user lands on your in-app login page instead: `auth.logout({ redirectTo: '/auth/login' })`. Without `redirectTo`, logout always goes to the hosted portal.
- `isAuthenticated` is a Svelte readable store — use `$isAuthenticated` in templates.
- **Important:** `profileStore` IS the profile store (`Readable<Profile | null | undefined>`) — use `$profileStore` directly in templates. Do NOT destructure it (`const { profile } = profileStore` gives you `undefined`, and `$profile` then throws `store_invalid_shape` in Svelte 5).

## Route protection

Routes are protected via the `rules` and `defaultAccess` passed to `bridgeBootstrap()` in `+layout.ts`.

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

The token is available via `tokenStore`. Read it and attach it as a `Bearer` header using whatever HTTP client the project uses.

**With `fetch`:**

```ts
import { get } from 'svelte/store';
import { tokenStore } from '@nebulr-group/bridge-svelte';

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const tokens = get(tokenStore);
  const headers = new Headers(options.headers);
  if (tokens?.accessToken) {
    headers.set('Authorization', `Bearer ${tokens.accessToken}`);
  }
  return fetch(url, { ...options, headers });
}
```

**With `urql` (GraphQL):**

```ts
import { get } from 'svelte/store';
import { tokenStore } from '@nebulr-group/bridge-svelte';

const client = createClient({
  url: '/graphql',
  fetchOptions: () => {
    const tokens = get(tokenStore);
    return {
      headers: tokens?.accessToken
        ? { Authorization: `Bearer ${tokens.accessToken}` }
        : {},
    };
  },
});
```

Adapt the pattern to whatever HTTP client the project uses. The key is: read `tokenStore`, add the `Authorization: Bearer` header to requests that hit protected endpoints. Public endpoints (e.g., card search) don't need the header.

## Integration checklist

Before verifying, confirm every item was applied. Do not skip any:

- [ ] Old auth package removed (`@nebulr/nblocks-svelte` or equivalent) and any local tarballs deleted
- [ ] `@nebulr-group/bridge-svelte` installed using the project's package manager
- [ ] `src/routes/+layout.ts` — `export const load = bridgeBootstrap({ rules, defaultAccess })`
- [ ] `src/routes/+layout.ts` — exports `ssr = false`
- [ ] `src/routes/+layout.ts` — `defaultAccess` is `'protected'`, only `/auth/*` is public
- [ ] `src/routes/+layout.svelte` — wraps the app in `<BridgeBootstrap>…</BridgeBootstrap>` (no `ready` flag of your own)
- [ ] `src/routes/+layout.svelte` — imports `@nebulr-group/bridge-svelte/styles`
- [ ] `src/routes/auth/oauth-callback/+page.svelte` — file exists (even if minimal)
- [ ] Bridge app configured: `redirect-uris` includes the callback URL, `allowed-origins` includes the frontend origin
- [ ] Login/logout buttons added to nav using `auth.login()` and `auth.logout()`
- [ ] User display using `isAuthenticated` store and `profileStore`
- [ ] `VITE_BRIDGE_APP_ID` set in the `.env` file (plus `VITE_BRIDGE_API_BASE_URL` for a stage or local app)
- [ ] Auth headers added to API calls that hit protected backend endpoints (using `tokenStore`)
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
{#if bridge.tenant.entitlements.can('ai_completions')}
  <FeatureUI />
{/if}
```

`can()` is synchronous and reflects the latest snapshot or `entitlements.changed` push.

### Using in components

Import the `bridge` singleton from `@nebulr-group/bridge-svelte` wherever you need it — components, `.svelte.ts` modules or plain `.ts` files. Its scopes are Svelte stores, so use `$` in templates (for example `const subscription = bridge.tenant.subscription;` then `$subscription?.plan?.slug`). No provider or context wiring is needed beyond the `<BridgeBootstrap>` already in your root layout.

> `@nebulr-group/bridge-svelte` does **not** export a `useBridge()` hook. Do not import one from it — use the `bridge` singleton above.

### Mapping from legacy exports

| Legacy (deprecated) | Unified surface |
|---|---|
| `subscriptionStore` (`$subscriptionStore.status`) | `bridge.tenant.subscription` (`$bridge.tenant.subscription`) |
| `loadSubscription()` | snapshot auto-populates `bridge.tenant.subscription`; no manual call needed |
| `getBridgeAuth().getProfile()` | `bridge.user` (snapshot) — full Profile via `getBridgeAuth().getProfile()` still works for fields outside the snapshot |
| `getBridgeAuth().getPlans()` | `bridge.app.plans.load()` — lazy + cached |

The legacy exports continue to work; they emit a one-time `console.warn` directing you to the unified surface.
