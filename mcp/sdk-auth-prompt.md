# Bridge SvelteKit Integration — SDK Auth

You are integrating The Bridge into a SvelteKit application using **in-app SDK authentication**. Instead of redirecting users to an external hosted login page, the app renders its own login and signup forms using Bridge SDK components (`LoginForm`, `SignupForm`). Users never leave the app.

> **SDK version:** Specific behaviors called out below — `profileStore` being the store directly (not an object), `LoginForm` not navigating after sign-in (your `onLogin` does it), the SDK reading no environment variables — hold from `@nebulr-group/bridge-svelte` 0.3 onwards. `readReturnTo` (deep-link return after login) is exported from 0.7 onwards. `BridgeAuthRoutes` (every auth page from one file) is newer still — if the installed version does not export it, upgrade rather than hand-writing the pages. If in doubt, check the published `.d.ts` files of the installed version.

## Decide first — hosted or in-app?

| You want | Mode | What you build | Config |
|---|---|---|---|
| Bridge owns the login UI | **Hosted** (default) | Nothing — no login page | No `loginRoute` |
| Login inside your app, your styling | **SDK auth** — **this guide** | One catch-all route rendering `<BridgeAuthRoutes />` | Set `loginRoute` |

**One config field is the whole switch.** Passing `loginRoute` to `bridgeBootstrap()` turns hosted mode off. If you are being redirected to a route you never built, that is why.

If the user has not said which they want, ask. A wrong guess here means rewriting the auth pages.

The rest of this guide covers **SDK auth**.

## Then decide — which component for which screen

Every screen below is already built. Reach for the component; do not hand-roll the form.

| Need | Component |
|---|---|
| Sign in | `LoginForm` |
| Sign up | `SignupForm` |
| Forgot password, and redeeming a reset/verification token | `ForgotPassword` (also inline in `LoginForm`) |
| Magic link request | `MagicLink` |
| Passkey login | `PasskeyLogin` |
| Passkey setup | `PasskeySetup`, `PasskeyRequestSetupLink` |
| MFA challenge / setup | `MfaChallenge`, `MfaSetup` |
| Workspace ("tenant") selection | `WorkspaceSelector`, `TenantSelector` |
| SSO button | `SsoButton` |

All of them import from `@nebulr-group/bridge-svelte`. There is no hosted-login entry component in this package — hosted mode needs no component at all.

> **`LoginForm` is not just an email and password box.** It drives forgot-password, magic link, passkeys, MFA and tenant selection as inline steps, and it decides which methods to show from the app's own admin configuration — which the client cannot see. Rebuilding any of it means reimplementing a flow that already exists and then keeping it in sync with settings you have no visibility of.
>
> If you are about to write a password input, check whether `LoginForm` already covers the case.

**The auth pages are one file.** `src/routes/auth/[...bridge]/+page.svelte` rendering `<BridgeAuthRoutes />` serves login, signup, the OAuth callback, set password, forgot password, magic link, passkey setup and workspace selection — see *Serve the auth pages* below.

## Prerequisites

- **appId** — your Bridge application ID. Passed in from the master prompt (Step 3); confirm or retrieve via `bridge app get`.
- **Package manager** — passed in from the master prompt (Step 1); confirm by checking for `bun.lock`, `pnpm-lock.yaml`, `yarn.lock`, or `package-lock.json`.

### Bridge admin app configuration (server-side)

Two server-side settings on the Bridge app must be in place before any SDK auth flow will work end-to-end. The master integration prompt covers `allowedOrigins` (Step 3b), but `tenantSelfSignup` is specific to SDK auth and must be confirmed here:

- **`tenantSelfSignup` must be enabled.** Without it, `SignupForm` returns `403 Forbidden` from `/auth/auth/signup`. Enable it via `bridge app update --tenant-self-signup true` or the Bridge admin dashboard.
- **App origin must be in `allowedOrigins`** — every origin the app is served from, including each local dev port (`http://localhost:5173` and `http://localhost:5175` are different origins). This was set in the master integration prompt's Step 3b (`bridge app update --allowed-origins <frontend-url>`). Confirm it's present: from an origin that is not listed, **sign-in itself is blocked** with `403 {"message":"Origin not allowed"}`: password sign-in (`POST /auth/authenticate`) and the token exchange that finishes magic-link, passkey and MFA sign-in (`POST /auth/token/direct`), plus signup, MFA code entry and passkeys. Sending a magic link still succeeds, so with magic links the failure only shows up after the link is clicked. The email-link generator depends on it too: the signup verification email is built from the `Origin` header of the signup request and falls back to a hosted handover URL when it doesn't match. To add an origin without the CLI: Bridge admin → **Authentication** → **Security** tab → **Allowed Origins**.
- **Enable the auth methods you intend to surface** (password, magic link, passkeys, SSO providers). The SDK components render a method's UI only when the app has it enabled — e.g. `LoginForm` shows the magic-link button only when `magicLinkEnabled` is on. Enable via `bridge app update --magic-link-enabled true --passkeys-enabled true` (or the Bridge admin dashboard) for every method the routes below wire up.

Confirm all of these before proceeding. If any is missing, set it now — fixing this after the integration is wired in is a worse debugging experience.

## Integration audit

> This section is the audit checklist the master prompt's Step 1b delegates to. When called from master, the answers are already known — use this to confirm, not re-investigate.

Check if Bridge is already set up in this project:

1. Is `@nebulr-group/bridge-svelte` in `package.json` dependencies?
2. Does `src/routes/+layout.ts` call `bridgeBootstrap()`?
3. Does `src/routes/+layout.svelte` render `<BridgeBootstrap>`?

**If all three are true:** Bridge is already set up (likely with hosted/redirect auth). Skip to [Convert to SDK auth](#convert-to-sdk-auth-existing-hosted-setup) below.

**If none are true:** This is a fresh project. Continue from [Install](#install) below.

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

Optional peer dependencies (install only if the feature is needed):

| Package | When needed |
|---------|-------------|
| `@stripe/stripe-js` | Paid subscription plans (Stripe Checkout) |
| `@simplewebauthn/browser` | Passkey (WebAuthn) authentication |

## Wire the root layout load function

Create or update `src/routes/+layout.ts`:

```ts
import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';

export const ssr = false;

export const load = bridgeBootstrap({
  loginRoute: '/auth/login',
  rules: [
    { match: new RegExp('^/auth($|/)'), public: true },
  ],
  defaultAccess: 'protected',
});
```

**Key points:**
- That one call is the whole wiring. Bridge reads the app id from `VITE_BRIDGE_APP_ID` and, for a stage or local app, the API address from `VITE_BRIDGE_API_BASE_URL` (see Environment variables).
- Anything you pass explicitly wins over the environment, and the environment wins over the built-in default.
- With no app id anywhere, Bridge refuses to start and names the missing `VITE_BRIDGE_APP_ID` instead of guessing.
- `ssr = false` is required — Bridge auth is client-side only.
- `loginRoute` tells Bridge where to redirect unauthenticated users. This is the key difference from hosted auth: instead of redirecting to an external hosted page, users go to your in-app login page.
- `defaultAccess: 'protected'` means all routes require login unless marked `public`.
- `/auth/*` must be public so the login and signup pages are accessible to unauthenticated users.
- `<BridgeAuthRoutes>` links its pages to each other itself, so you set no `signupRoute`.

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
- Put your navigation and page shell inside it too (e.g. `<Nav />`, `<BridgeBillingNotice />`, `<main>`).
- **You must import `@nebulr-group/bridge-svelte/styles`** — this provides required structural CSS and visual defaults for Bridge components (login forms, alerts, buttons). Without it, Bridge UI elements will render unstyled and broken. If the project uses its own design system (e.g., Tailwind), you can override the visual defaults via CSS variables but the import must still be present.

## Serve the auth pages — one file

Create `src/routes/auth/[...bridge]/+page.svelte`:

```svelte
<script lang="ts">
  import { BridgeAuthRoutes } from '@nebulr-group/bridge-svelte';
</script>

<BridgeAuthRoutes />
```

That one file serves every auth page. Do not create the pages one by one.

| Route | Renders | Purpose |
|---|---|---|
| `/auth/login` | `LoginForm` | Email/password login + inline magic link / passkey / SSO / forgot-password / MFA / workspace selection. After sign-in it goes to the `?redirectUri=` deep link (validated with `readReturnTo`), else `/` |
| `/auth/signup` | `SignupForm` | New account creation. Sends a verification email |
| `/auth/oauth-callback` | nothing | Landing page for OAuth/SSO redirects. `bridgeBootstrap` exchanges the code and redirects before the page mounts |
| `/auth/set-password/[token]` | `ForgotPassword` with the token | **Both** signup verification emails and password-reset emails land here |
| `/auth/forgot-password` | `ForgotPassword` | Password-reset request |
| `/auth/magic-link` | `MagicLink` | Magic-link request; a link requested here also signs the user in here |
| `/auth/setup-passkey/[token]` | `PasskeySetup` | Passkey registration from a one-time email link |
| `/auth/workspaces` | `WorkspaceSelector` | Switch workspace (a signed-out visitor is sent to sign in first) |

Any other address under `/auth` gets your app's own 404.

**How it works:**
- bridge-api writes `{app-origin}/auth/set-password/{token}?flow=signup` into every signup verification email. The catch-all serves that page, so signups cannot break because a page was left out.
- Which sign-in methods appear (magic link, passkeys, SSO) comes from the app's configuration in the Bridge dashboard at runtime. The operator turns a method on or off there, with no code change and no deploy, and the page for it is already served.
- The pages render inside your own `+layout.svelte`, so your navigation and shell stay around them.
- `redirectTo` (default `'/'`) sets where a finished sign-in lands when there is no deep link to return to: `<BridgeAuthRoutes redirectTo="/dashboard" />`.

### Customising — pick the lowest rung that does the job

1. **Tokens.** Restyle the forms with the `--bridge-*` CSS variables (see Theming). `--bridge-auth-page-padding` sets the default page padding.
2. **Frame and heading.** Two snippets restyle everything around the form, on every page, without owning any route:

   ```svelte
   <script lang="ts">
     import { BridgeAuthRoutes, type BridgeAuthPage } from '@nebulr-group/bridge-svelte';

     const titles: Partial<Record<BridgeAuthPage, string>> = {
       login: 'Welcome back',
       signup: 'Create your account',
     };
   </script>

   <BridgeAuthRoutes>
     {#snippet frame(page, children)}
       <main class="auth-card">{@render children()}</main>
     {/snippet}
     {#snippet heading(page)}
       <h1>{titles[page] ?? 'Account'}</h1>
     {/snippet}
   </BridgeAuthRoutes>
   ```

   `frame(page, children)` replaces the default centred container entirely. `heading(page)` replaces the form's heading on each page's main step only: the login credentials step, the signup form, the set-password form. Sub-steps ("Reset your password", "Check your email") keep their own heading, so the two never stack. There are no per-page snippets; to change more than the frame and heading, take over the page (next rung).
3. **Take over one page.** Create that page's own file, for example `src/routes/auth/login/+page.svelte`. SvelteKit prefers the specific route over `[...bridge]`, so yours renders and every other page keeps working. Build it from the component in the table above:

   ```svelte
   <!-- src/routes/auth/login/+page.svelte -->
   <script lang="ts">
     import { goto } from '$app/navigation';
     import { page } from '$app/stores';
     import { LoginForm, readReturnTo } from '@nebulr-group/bridge-svelte';
   </script>

   <LoginForm onLogin={() => goto(readReturnTo($page.url) ?? '/')} />
   ```

   A page you own must navigate after sign-in itself: `LoginForm` never navigates, it calls `onLogin`. Always go through `readReturnTo` — never navigate to `$page.url.searchParams.get(...)` directly; whoever wrote the link controls that value, so navigating to it unchecked is an open redirect.
4. **Headless.** Build your own UI on `getBridgeAuth()`.

## Convert to SDK auth (existing hosted setup)

If the project already has Bridge hosted (redirect) auth set up and you want to convert to in-app SDK auth:

### 1. Add `loginRoute` to your `bridgeBootstrap()` call

In `src/routes/+layout.ts`, add `loginRoute` next to your rules:

```ts
export const load = bridgeBootstrap({
  loginRoute: '/auth/login',
  rules: [ /* keep your existing rules */ ],
  defaultAccess: 'protected',
});
```

If your layout still uses the older `await bridgeBootstrap(url, config, routeConfig)` form inside a hand-written `load`, replace it with the one-call form above and wrap your app in `<BridgeBootstrap>…</BridgeBootstrap>` as shown in [Wire the root layout component](#wire-the-root-layout-component). The old form still works, but it reads no environment variables.

`loginRoute` is what switches Bridge from hosted auth to SDK auth. When it's set, the route guard redirects unauthenticated users to your in-app page instead of the external hosted login.

### 2. Serve the auth pages

Create `src/routes/auth/[...bridge]/+page.svelte` rendering `<BridgeAuthRoutes />`, as described in [Serve the auth pages](#serve-the-auth-pages--one-file). If the project already has hand-written pages under `src/routes/auth/` (for example an empty `oauth-callback/+page.svelte` from hosted mode), delete the ones that only render a Bridge component — a specific page file takes precedence over the catch-all, so a leftover stub would hide the page Bridge serves.

### 3. Remove manual `auth.login()` calls

If the project calls `auth.login()` to trigger the hosted login redirect, those calls are no longer needed. The route guard automatically redirects unauthenticated users to your `loginRoute`. Remove or replace any explicit `auth.login()` calls:

- **Navigation buttons** that called `auth.login()` should now use `<a href="/auth/login">` instead (or the route guard handles it automatically when the user hits a protected route).
- **Logout** now requires passing `redirectTo` in SDK mode: `getBridgeAuth().logout({ redirectTo: '/auth/login' })`. Without it, `logout()` redirects to the hosted Bridge portal instead of your in-app login page.

### 4. The OAuth callback is served too

`/auth/oauth-callback` is one of the pages the catch-all serves, so social login (Google, GitHub, etc.) keeps completing its code exchange. An old empty `oauth-callback/+page.svelte` does no harm, but it is no longer needed.

## Add login/logout to navigation

Add login and logout controls to your navigation or header component:

```svelte
<script lang="ts">
  import { isAuthenticated, profileStore, getBridgeAuth } from '@nebulr-group/bridge-svelte';

  function handleLogout() {
    getBridgeAuth().logout({ redirectTo: '/auth/login' });
  }
</script>

{#if $isAuthenticated}
  <span>{$profileStore?.fullName ?? $profileStore?.email}</span>
  <button onclick={handleLogout}>Log out</button>
{:else}
  <a href="/auth/login">Log in</a>
{/if}
```

**Key points:**
- With SDK auth, the "Log in" action is a simple link to `/auth/login` — no JavaScript call needed.
- **In SDK mode, always pass `redirectTo` to `logout()`.** Without it, `logout()` redirects to the hosted Bridge portal (`auth.thebridge.dev`). Pass your in-app login route: `getBridgeAuth().logout({ redirectTo: '/auth/login' })`. Replace `'/auth/login'` with whatever path you set as `loginRoute` in your `BridgeConfig`.
- `isAuthenticated` is a Svelte readable store — use `$isAuthenticated` in templates.
- `profileStore` IS the profile store directly (`Readable<Profile | null | undefined>`) — use `$profileStore` in templates. Earlier versions of this guide instructed `const { profile } = profileStore` and `$profile`; that pattern does NOT work in 0.3.x and will throw `store_invalid_shape` in Svelte 5.

## Route protection

Routes are protected via the `rules` and `defaultAccess` passed to `bridgeBootstrap()` in `+layout.ts`.

**Config structure:**

```ts
export const load = bridgeBootstrap({
  loginRoute: '/auth/login',
  rules: [
    // Required — auth pages must be accessible to unauthenticated users
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
- `redirectTo` specifies where to send a signed-in user who doesn't meet the `featureFlag` requirement (defaults to `/`). A signed-out visitor on a protected route always goes to the login route.

**When an unauthenticated user hits a protected route:**
- They are redirected to your `loginRoute` (`/auth/login`) — the in-app login page — with the page they asked for attached as `?redirectUri=…`.
- After login, `<BridgeAuthRoutes>` sends them back to it (validated with `readReturnTo`), or to `redirectTo` when there is none. A login page you own does this in its `onLogin` (see *Take over one page*).

**Key difference from hosted auth:** In hosted auth, unauthenticated users are redirected to an external Bridge login page. With SDK auth, they are redirected to your in-app login page at `/auth/login` (or whatever you set as `loginRoute`).

**What the guard covers:** `bridgeBootstrap()` re-evaluates the route rules on every navigation — the first page load, client-side navigations, and redirects thrown from your own `load` functions (e.g. a public `/` whose `+page.ts` redirects into the app). If it cannot reach a decision (network error, broken config) it denies protected routes. For defence in depth on a sensitive page, also call `assertAuthorized(url)` from that page's own `load` (exported from `@nebulr-group/bridge-svelte`). Route guards control what the browser renders; they are **not** authorization — your API must still verify the user's token.

**Default: protect everything.** The only routes that must be public are `/auth/*` (your login and signup pages live there). All other routes should be protected by default. The user can relax this later for specific pages (landing, search, docs, etc.) using the route config.

**Detecting existing public route config:**
- If the app has an existing public route config (e.g., `PUBLIC_ROUTES` array), do NOT carry those over automatically. Start with everything protected and let the user decide what to open up.

## Environment variables

Add to your `.env` file (or `.env.local` for local dev):

```env
VITE_BRIDGE_APP_ID=your-app-id-here
# Only for a non-production app (stage, local, self-hosted):
# VITE_BRIDGE_API_BASE_URL=https://api-stage.thebridge.dev
```

Bridge reads these variables itself — you do not pass them anywhere. Anything you pass to `bridgeBootstrap()` explicitly wins over the environment, and the environment wins over the default.

| Variable | Config field | Default when unset | Description |
|----------|-------------|--------------------|-------------|
| `VITE_BRIDGE_APP_ID` | `appId` (required) | — Bridge refuses to start and names this variable | Your Bridge application ID |
| `VITE_BRIDGE_API_BASE_URL` | `apiBaseUrl` | `https://api.thebridge.dev` (production) | Bridge API base URL — set it for stage, local dev or self-hosted |
| `VITE_BRIDGE_DEBUG` | `debug` | `false` | `true` enables debug logging in the console |

A production app sets only `VITE_BRIDGE_APP_ID`. In a development build, an app id with no `VITE_BRIDGE_API_BASE_URL` logs one console warning saying production is in use — if you see it for a stage or local app, set the variable.

Note: `VITE_BRIDGE_HOSTED_URL` is not needed for SDK auth since users are not redirected to the hosted login page.

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
- `profileStore` — `Readable<{ fullName, email, tenant, onboarded, ... } | null | undefined>` (use `$profileStore` directly — it is the store itself, NOT an object containing nested stores)
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
- [ ] `src/routes/+layout.ts` — `export const load = bridgeBootstrap({ loginRoute, rules, defaultAccess })`
- [ ] `src/routes/+layout.ts` — exports `ssr = false`
- [ ] `src/routes/+layout.ts` — the call includes `loginRoute: '/auth/login'`
- [ ] If the app owns its own login page (rung 3), its `LoginForm` has an `onLogin` that navigates with `goto(readReturnTo($page.url) ?? '/')` — `<BridgeAuthRoutes>` does this itself
- [ ] `src/routes/+layout.ts` — `defaultAccess` is `'protected'`, `/auth/*` is public
- [ ] `src/routes/+layout.svelte` — wraps the app in `<BridgeBootstrap>…</BridgeBootstrap>` (no `ready` flag of your own)
- [ ] `src/routes/+layout.svelte` — imports `@nebulr-group/bridge-svelte/styles`
- [ ] `src/routes/auth/[...bridge]/+page.svelte` — file exists and renders `<BridgeAuthRoutes />` (with the `frame` / `heading` snippets if the app restyles the auth pages)
- [ ] No hand-written page under `src/routes/auth/` that only renders a Bridge component — each one hides the catch-all's page for that address
- [ ] `tenantSelfSignup` is enabled on the Bridge app (server-side) — confirmed in admin dashboard or via `bridge app get`
- [ ] App origin is in `allowedOrigins` (server-side) — confirmed in admin dashboard or via `bridge app get`
- [ ] Login/logout controls added to navigation (`<a href="/auth/login">` for login; logout calls `getBridgeAuth().logout({ redirectTo: '/auth/login' })`)
- [ ] User display uses `$isAuthenticated` and `$profileStore` directly — NOT the `const { profile } = profileStore` destructure pattern (that pattern is invalid in 0.3.x and triggers `store_invalid_shape` in Svelte 5)
- [ ] `VITE_BRIDGE_APP_ID` set in the `.env` file (plus `VITE_BRIDGE_API_BASE_URL` for a stage or local app)
- [ ] Calls to protected backend endpoints go through `bridgeFetch` (no hand-written auth fetch helper)
- [ ] Old env vars removed (`VITE_NBLOCKS_APP_ID`, etc.)
- [ ] Old auth imports and route config removed (e.g., `PUBLIC_ROUTES` array)
- [ ] No manual `auth.login()` calls remain (replaced by navigation to login route or handled by route guard)

## Verify the integration

After completing the setup:

1. **Build check:** Run the project's build command. There should be no TypeScript or import errors.
2. **Dev server check:** Start the dev server. The app should load without console errors.
3. **Protected route redirect:** Navigate to a protected route while logged out. You should be redirected to `/auth/login` (your in-app login page), NOT an external hosted page.
4. **Login page renders:** The `/auth/login` page should display the `LoginForm` component with proper styling. The visible auth methods (password, magic link, passkeys, SSO) depend on your app's configuration in the Bridge dashboard.
5. **Signup page renders:** The `/auth/signup` page should display the `SignupForm` component with proper styling.
6. **Login flow works:** Enter credentials and submit. The network calls should succeed AND the page should navigate away from `/auth/login` to your post-login destination. **If the network calls succeed but the page does not navigate, the app owns its login page and its `LoginForm` is missing `onLogin`** — `LoginForm` never navigates by itself. Add the `onLogin` shown in *Take over one page*, or delete the page and let the catch-all serve it. **If a sign-in request answers `403 {"message":"Origin not allowed"}`**, the origin you are serving from (scheme, host and port) is not in the app's allowed origins — add it with `bridge app update --allowed-origins …` or under Bridge admin → Authentication → Security → Allowed Origins.
7. **Signup flow works end-to-end:** Create a new account via `/auth/signup`. Open the inbox and find the verification email. The link should point at `{your-app-origin}/auth/set-password/{token}?flow=signup`. Click it — the page should render the "Set new password" form (NOT a 404 and NOT a blank page). Set a password, confirm you land on a "password set" success state, then log in with the new credentials. **If you see a 404 after clicking the email link, `src/routes/auth/[...bridge]/+page.svelte` is missing or misnamed — the rest parameter must be `[...bridge]`.**
8. **Styles render correctly:** Bridge UI components (LoginForm, SignupForm, buttons, inputs) should have proper styling. If they appear unstyled, confirm that `@nebulr-group/bridge-svelte/styles` is imported in the root layout.
9. **Logout works in-app:** Clicking logout clears the session and lands the user on `/auth/login` of YOUR app — NOT on `auth.thebridge.dev`. If the user ends up on the hosted Bridge page, the logout call is missing `redirectTo`. Use `getBridgeAuth().logout({ redirectTo: '/auth/login' })`.
10. **Forgot-password flow works end-to-end:** From the login page, click "Forgot password?" (or navigate to `/auth/forgot-password`). Enter the email of an existing user, submit, and check the inbox. Click the reset link — it should land on `/auth/set-password/{token}` and render the same "Set new password" form. Set a new password and log in with it.
11. **The auth pages resolve:** Signed out, open `/auth/signup`, `/auth/set-password/test-token`, `/auth/forgot-password`, `/auth/magic-link` and `/auth/setup-passkey/test-token`. Each renders its form (set-password and setup-passkey show an error for the made-up token — the page rendering is what matters). `/auth/not-a-page` shows your app's 404. The magic-link and passkey buttons appear inside `LoginForm` only when those methods are enabled in the Bridge dashboard — that is expected.
