# Bridge SvelteKit Integration — SDK Auth

You are integrating The Bridge into a SvelteKit application using **in-app SDK authentication**. Instead of redirecting users to an external hosted login page, the app renders its own login and signup forms using Bridge SDK components (`LoginForm`, `SignupForm`). Users never leave the app.

> **SDK version:** This guide targets `@nebulr-group/bridge-svelte` `^0.3.0`. Specific behaviors called out below — `logout()` taking no arguments AND always redirecting to the hosted page (use `clearSession()` + reload for SDK-mode logout), `profileStore` being the store directly (not an object), `signupRoute` not existing on `BridgeConfig`, `LoginForm` not auto-navigating after auth — are 0.3.x semantics. Newer versions may differ; if the project is on a different version, double-check the published `.d.ts` files.

## Prerequisites

- **appId** — your Bridge application ID. Get it from `bridge app get` or the Bridge dashboard.
- **Package manager** — use whatever the project already uses (check for `bun.lock`, `pnpm-lock.yaml`, `yarn.lock`, or `package-lock.json`).

### Bridge admin app configuration (server-side)

Two server-side settings on the Bridge app must be in place before any SDK auth flow will work end-to-end. The master integration prompt covers `allowedOrigins` (Step 3b), but `tenantSelfSignup` is specific to SDK auth and must be confirmed here:

- **`tenantSelfSignup` must be enabled.** Without it, `SignupForm` returns `403 Forbidden` from `/auth/auth/signup`. Enable it via `bridge app update --tenant-self-signup true` or the Bridge admin dashboard.
- **App origin must be in `allowedOrigins`.** This was set in the master integration prompt's Step 3b (`bridge app update --allowed-origins <frontend-url>`). Confirm it's present — both the `SdkOriginGuard` (signup, SSO) and the email-link generator depend on it. The signup verification email is built using the `Origin` header of the signup request and must match an allowed origin or it will fall back to a hosted handover URL.

Confirm both before proceeding. If either is missing, set them now — fixing this after the integration is wired in is a worse debugging experience.

## Check existing Bridge setup

Before proceeding, check if Bridge is already set up in this project:

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
| `onBootstrapComplete` callback | `onBootstrapComplete` callback (same pattern) |
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
import type { LayoutLoad } from './$types';
import type { BridgeConfig, RouteGuardConfig } from '@nebulr-group/bridge-svelte';
import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';

export const ssr = false;

export const load: LayoutLoad = async ({ url }) => {
  const config: BridgeConfig = {
    appId: import.meta.env.VITE_BRIDGE_APP_ID,
    loginRoute: '/auth/login',
  };

  const routeConfig: RouteGuardConfig = {
    rules: [
      { match: new RegExp('^/auth($|/)'), public: true },
    ],
    defaultAccess: 'protected',
  };

  await bridgeBootstrap(url, config, routeConfig);
  return {};
};
```

**Key points:**
- `ssr = false` is required — Bridge auth is client-side only.
- `loginRoute` tells Bridge where to redirect unauthenticated users. This is the key difference from hosted auth: instead of redirecting to an external hosted page, users go to your in-app login page.
- `defaultAccess: 'protected'` means all routes require login unless marked `public`.
- `/auth/*` must be public so the login and signup pages are accessible to unauthenticated users.
- The `appId` comes from the `VITE_BRIDGE_APP_ID` environment variable.
- The signup link rendered by `LoginForm` is wired via the `signupHref` prop on the component (see the login page section below) — pass it directly rather than relying on a `signupRoute` config field.

## Wire the root layout component

Create or update `src/routes/+layout.svelte`:

```svelte
<script lang="ts">
  import { BridgeBootstrap } from '@nebulr-group/bridge-svelte';
  import '@nebulr-group/bridge-svelte/styles';

  let { children } = $props();
  let ready = $state(false);

  function onBootstrapComplete() {
    ready = true;
  }
</script>

<BridgeBootstrap {onBootstrapComplete} />

{#if ready}
  {@render children()}
{/if}
```

**Key points:**
- Content is hidden until `onBootstrapComplete` fires, preventing flash of protected content.
- **You must import `@nebulr-group/bridge-svelte/styles`** — this provides required structural CSS and visual defaults for Bridge components (login forms, alerts, buttons). Without it, Bridge UI elements will render unstyled and broken. If the project uses its own design system (e.g., Tailwind), you can override the visual defaults via CSS variables but the import must still be present.

## Required auth routes — overview

You must create **all seven** of the routes below, even if some of the corresponding features (magic link, passkeys, SSO) are currently disabled in the Bridge admin config.

**Why all seven, always.** The Bridge admin config toggles feature *visibility in the UI* — whether the magic-link button, passkey button, or SSO providers appear inside `LoginForm`. It does **not** toggle feature *presence in the codebase*. If a feature is enabled in admin and the matching route is missing, users hit a dead 404. Scaffolding all routes up front means the operator can flip features on or off in production via the admin dashboard without ever touching application code or shipping a deploy.

| # | Route | Component | Purpose |
|---|---|---|---|
| 1 | `/auth/login` | `LoginForm` | Email/password login + inline magic link / passkey / SSO / forgot-password / MFA / tenant selection |
| 2 | `/auth/signup` | `SignupForm` | New account creation. Sends a verification email to the user |
| 3 | `/auth/oauth-callback` | Stub page | Landing page for OAuth/SSO redirects. `bridgeBootstrap` handles the code exchange — the page only needs to exist |
| 4 | `/auth/set-password/[token]` | `ForgotPassword` (with `token`) | **Dual purpose** — both signup verification emails AND password reset emails redeem their token here |
| 5 | `/auth/forgot-password` | `ForgotPassword` (no `token`) | Standalone password-reset request entry point |
| 6 | `/auth/magic-link` | `MagicLink` | Standalone magic-link request page (request flow only — token redemption happens automatically inside `LoginForm` when `?bridge_magic_link_token=` is present in the URL) |
| 7 | `/auth/setup-passkey/[token]` | `PasskeySetup` (with `token`) | Passkey registration page reached from a one-time email link |

**The most important route is #4 (`set-password/[token]`).** bridge-api hard-codes the signup verification URL pattern as `{app-origin}/auth/set-password/{token}?flow=signup`. There is no way to opt out — every SDK-mode signup uses this URL. Missing this route silently breaks 100% of new signups: users sign up successfully, get the verification email, click the link, and land on a blank 404 with no recovery path.

The sections below walk through each of the seven routes in order.

## Create the login page

Create `src/routes/auth/login/+page.svelte`:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { LoginForm } from '@nebulr-group/bridge-svelte';
</script>

<div class="login-page">
  <LoginForm
    showSignupLink
    signupHref="/auth/signup"
    onLogin={() => goto('/')}
  />
</div>

<style>
  .login-page {
    display: flex;
    justify-content: center;
    padding: 3rem 1rem;
  }
</style>
```

**How it works:**
- **`onLogin` is required to navigate the user away from the login page.** `LoginForm` does NOT auto-redirect after successful authentication. It only fires the `onLogin` callback, and your code is responsible for navigating. Without an `onLogin` handler the user stays on `/auth/login` after entering valid credentials — every API call succeeds but the page never changes, which looks broken.
- The route guard (in `+layout.ts`) only runs on navigation events — it redirects unauthenticated users TO the login page, but it does not redirect authenticated users AWAY from the login page on auth state change. That's why `onLogin` is needed.
- Pick the destination that fits your app: `goto('/')` for the home/dashboard, or read the originally-requested URL from a query string (`$page.url.searchParams.get('redirect')`) if you persist it before redirecting to login.
- Auth method visibility (password, magic link, passkeys, SSO) is derived from your app's configuration in the Bridge dashboard. You don't need to configure this in code.
- `LoginForm` handles multi-step flows inline: forgot password, magic link requests, passkey login, MFA challenge, MFA setup, and tenant selection all render within the same component automatically when needed.
- `showSignupLink` + `signupHref="/auth/signup"` renders the "Sign up" link in the form footer. Always pass `signupHref` explicitly — the bundled `BridgeConfig` type in bridge-svelte 0.3.x does not declare a `signupRoute` config field, so the prop is the safe path.

**Optional props:** `onError` (fires on auth failure), `forgotPasswordHref` (sends users to `/auth/forgot-password` instead of the inline forgot-password step).

## Create the signup page

Create `src/routes/auth/signup/+page.svelte`:

```svelte
<script lang="ts">
  import { SignupForm } from '@nebulr-group/bridge-svelte';
</script>

<div class="signup-page">
  <SignupForm showLoginLink loginHref="/auth/login" />
</div>

<style>
  .signup-page {
    display: flex;
    justify-content: center;
    padding: 3rem 1rem;
  }
</style>
```

**How it works:**
- `showLoginLink` + `loginHref="/auth/login"` renders the "Log in" link in the form footer. Always pass `loginHref` explicitly — same reason as `signupHref` on `LoginForm`.
- After a successful signup, `SignupForm` swaps in-place to a "Check your email" success state — it does NOT navigate the user away. The user stays on `/auth/signup` reading the verification instructions, which is correct: they cannot proceed until they click the email link, and the next route in the flow is `/auth/set-password/{token}` reached via the email — not anything you `goto()` directly.
- The verification email goes to `{app-origin}/auth/set-password/{token}?flow=signup`. Make sure that route exists (covered below).

**Optional props:** `onSignup` (fires after the API call succeeds — useful for analytics or to redirect to a custom "check your email" page if you'd rather render your own success state), `onError` (fires on failure).

## Create the OAuth callback page

Create `src/routes/auth/oauth-callback/+page.svelte`:

```svelte
<!-- OAuth callback. The code-for-tokens exchange happens in +layout.ts via
     bridgeBootstrap, which throws a SvelteKit redirect() before this
     component ever mounts. Intentionally empty — no flash, no markup. -->
```

**How it works:**
- `bridgeBootstrap` (called from `+layout.ts`) detects when the URL matches the configured `callbackUrl` path, reads the `?code=` query parameter, exchanges it for tokens, and **throws a SvelteKit `redirect(303, ...)`** to send the user to `/` (or the originally-requested route).
- Because the redirect is thrown from the layout `load` function, the page component never mounts. Leaving the file empty produces a clean no-flash UX: the user lands on the callback URL, the load runs, the redirect fires, and the user sees the destination page directly. There is no visible "Signing you in…" screen.
- The file MUST still exist (even if empty) so SvelteKit recognizes the route and runs the layout `load`. A missing route file means SvelteKit returns 404 before the layout has a chance to handle the callback.
- Required for SSO flows (Google, GitHub, Microsoft, etc.) and for any OAuth-based federated login.

**Edge case:** If the callback URL is hit without a `?code=` param (or if the exchange fails), `bridgeBootstrap` logs a warning and falls through to the route guard, which sends the user to `/auth/login`. The user still sees no flash from this page. If you want to render a custom error UI for this case, add a Svelte component to this file — but for the happy path, empty is best.

## Create the set-password page

Create `src/routes/auth/set-password/[token]/+page.svelte`:

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import { ForgotPassword } from '@nebulr-group/bridge-svelte';

  let token = $derived($page.params.token);
</script>

<div class="page-container">
  <ForgotPassword {token} loginHref="/auth/login" />
</div>

<style>
  .page-container {
    display: flex;
    justify-content: center;
    padding: 3rem 1rem;
  }
</style>
```

**How it works:**
- This route handles **two flows with the same component**: signup email verification AND password reset. Both flows redeem a one-time token to set a password, so they share the same UI and the same backend endpoint.
- The `ForgotPassword` component renders a "Set new password" form when a `token` prop is provided (this route) and a "Reset your password" email-entry form when no token is provided (the next route).
- bridge-api builds the verification email URL as `{app-origin}/auth/set-password/{token}?flow=signup`. The `flow=signup` query parameter is used internally by Bridge for analytics — your code does not need to read it.
- After the user sets a password, they're shown a success state with a link back to `/auth/login`.

**This is the most critical route.** Missing it silently breaks every new signup — users sign up successfully but cannot complete verification.

## Create the forgot-password page

Create `src/routes/auth/forgot-password/+page.svelte`:

```svelte
<script lang="ts">
  import { ForgotPassword } from '@nebulr-group/bridge-svelte';
</script>

<div class="page-container">
  <ForgotPassword loginHref="/auth/login" />
</div>

<style>
  .page-container {
    display: flex;
    justify-content: center;
    padding: 3rem 1rem;
  }
</style>
```

**How it works:**
- Same component as the set-password page, but without a `token` prop. The component switches into "request a reset link" mode: it shows an email input, and on submit calls `sendResetPasswordLink(email)`.
- `LoginForm` already has an inline forgot-password flow built into it (the "Forgot password?" link toggles into a sub-step), so this standalone route is not the only entry point — but it is required for two cases: (1) users arriving cold via a "forgot password" link in your marketing emails or docs, and (2) the case where you set `forgotPasswordHref` on `LoginForm` to send users here instead of using the inline flow.

## Create the magic-link page

Create `src/routes/auth/magic-link/+page.svelte`:

```svelte
<script lang="ts">
  import { MagicLink } from '@nebulr-group/bridge-svelte';
</script>

<div class="page-container">
  <MagicLink loginHref="/auth/login" />
</div>

<style>
  .page-container {
    display: flex;
    justify-content: center;
    padding: 3rem 1rem;
  }
</style>
```

**How it works:**
- Standalone page for requesting a magic link. The user enters their email, presses send, and receives an email containing a one-time login link.
- **Magic-link redemption is handled automatically inside `LoginForm`.** When `LoginForm` mounts, it checks `window.location.search` for `?bridge_magic_link_token=…`; if found, it redeems the token and logs the user in. No separate redemption route is needed — the email link points back at `/auth/login?bridge_magic_link_token=…`.
- This route must exist even if magic link is currently disabled in the Bridge admin config. Toggling magic link on later should not require a code deploy.

## Create the setup-passkey page

Create `src/routes/auth/setup-passkey/[token]/+page.svelte`:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { PasskeySetup } from '@nebulr-group/bridge-svelte';

  let token = $derived($page.params.token);
</script>

<div class="page-container">
  <PasskeySetup
    {token}
    onComplete={() => goto('/')}
    onBack={() => goto('/auth/login')}
    onExpired={() => goto('/auth/login')}
  />
</div>

<style>
  .page-container {
    display: flex;
    justify-content: center;
    padding: 3rem 1rem;
  }
</style>
```

**How it works:**
- Reached via a one-time email link sent by `PasskeyRequestSetupLink` (which is itself rendered inline by `LoginForm` when the user chooses "set up a passkey").
- `onComplete` fires after the passkey is registered with the device — redirect the user wherever makes sense for your app (a protected home page, account settings, etc.).
- `onBack` fires if the user cancels; `onExpired` fires if the setup token has expired — both should send the user back to `/auth/login`.
- This route must exist even if passkeys are currently disabled in the Bridge admin config.

## Convert to SDK auth (existing hosted setup)

If the project already has Bridge hosted (redirect) auth set up and you want to convert to in-app SDK auth:

### 1. Add `loginRoute` to your `BridgeConfig`

In `src/routes/+layout.ts`, update the config object:

```ts
const config: BridgeConfig = {
  appId: import.meta.env.VITE_BRIDGE_APP_ID,
  loginRoute: '/auth/login',
};
```

`loginRoute` is what switches Bridge from hosted auth to SDK auth. When it's set, the route guard redirects unauthenticated users to your in-app page instead of the external hosted login. The signup link is wired via the `signupHref` prop on `LoginForm` (covered in the login page section).

### 2. Create the login and signup pages

Create `src/routes/auth/login/+page.svelte` and `src/routes/auth/signup/+page.svelte` as described in the sections above.

### 3. Remove manual `auth.login()` calls

If the project calls `auth.login()` to trigger the hosted login redirect, those calls are no longer needed. The route guard automatically redirects unauthenticated users to your `loginRoute`. Remove or replace any explicit `auth.login()` calls:

- **Navigation buttons** that called `auth.login()` should now use `<a href="/auth/login">` instead (or the route guard handles it automatically when the user hits a protected route).
- **Logout** still works the same way: `getBridgeAuth().logout()`.

### 4. The OAuth callback route can remain

If the project has `src/routes/auth/oauth-callback/+page.svelte`, it can stay. It won't interfere with SDK auth. If the app uses social login (Google, GitHub, etc.), the callback route is still needed to complete the OAuth code exchange for those providers.

## Add login/logout to navigation

Add login and logout controls to your navigation or header component:

```svelte
<script lang="ts">
  import { isAuthenticated, profileStore, getBridgeAuth } from '@nebulr-group/bridge-svelte';

  function handleLogout() {
    // In 0.3.x, `logout()` always navigates to the hosted Bridge logout page
    // via `window.location.href = createLogoutUrl()` regardless of whether the
    // app is in SDK mode. To stay in-app, use `clearSession()` (silent token
    // clear) and trigger a full page reload to the in-app login route — the
    // reload re-runs `bridgeBootstrap` from a clean state, which re-syncs the
    // Svelte stores. (A SvelteKit `goto()` is NOT enough: `clearSession()`
    // does not emit `auth:logout`, so the in-memory profile/token stores stay
    // populated until the page is fully reloaded.)
    getBridgeAuth().clearSession();
    window.location.assign('/auth/login');
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
- **Do NOT call `getBridgeAuth().logout()` in SDK mode.** In bridge-svelte 0.3.x, `logout()` unconditionally redirects to the hosted Bridge logout URL (`auth.thebridge.dev/auth/login/<appId>`) via `window.location.href`. There is no SDK-mode branch and no `redirectTo` option. Any `await logout(); goto(...)` pattern is dead code — the `goto()` never runs because the page has already started navigating to the hosted page.
- **Use `clearSession()` + `window.location.assign('/auth/login')` instead.** `clearSession(): void` silently wipes tokens from storage without emitting `auth:logout` and without redirecting. The hard-reload to `/auth/login` is required (a `goto()` is not enough): the in-memory Svelte stores (`profileStore`, `tokenStore`, `flagsStore`) are wired to the `auth:logout` event, which `clearSession()` skips, so without a full reload they stay populated and the UI thinks the user is still logged in. The reload re-runs `bridgeBootstrap` which re-reads localStorage (now empty) and initializes the stores as logged-out.
- `isAuthenticated` is a Svelte readable store — use `$isAuthenticated` in templates.
- `profileStore` IS the profile store directly (`Readable<Profile | null | undefined>`) — use `$profileStore` in templates. Earlier versions of this guide instructed `const { profile } = profileStore` and `$profile`; that pattern does NOT work in 0.3.x and will throw `store_invalid_shape` in Svelte 5.

> **Known SDK gap (track upstream):** In a future bridge-svelte release, `logout()` should accept a `{ redirectTo?: string }` option (or a `silent: true` flag) so SDK-mode apps can log out in-place without the `clearSession()` workaround. Until then, the pattern above is the correct approach for SDK mode.

## Route protection

Routes are protected via the `RouteGuardConfig` passed to `bridgeBootstrap()`.

**Config structure:**

```ts
const routeConfig: RouteGuardConfig = {
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
};
```

**Rule matching:**
- `match` accepts a string (exact prefix match) or `RegExp`.
- `public: true` allows unauthenticated access.
- `featureFlag` requires the user to be logged in AND have the flag enabled.
- `redirectTo` specifies where to send users who don't meet the requirement (defaults to the login route).

**When an unauthenticated user hits a protected route:**
- They are redirected to your `loginRoute` (`/auth/login`) — the in-app login page.
- After login, they are redirected back to the route they originally requested.

**Key difference from hosted auth:** In hosted auth, unauthenticated users are redirected to an external Bridge login page. With SDK auth, they are redirected to your in-app login page at `/auth/login` (or whatever you set as `loginRoute`).

**Default: protect everything.** The only routes that must be public are `/auth/*` (your login and signup pages live there). All other routes should be protected by default. The user can relax this later for specific pages (landing, search, docs, etc.) using the route config.

**Detecting existing public route config:**
- If the app has an existing public route config (e.g., `PUBLIC_ROUTES` array), do NOT carry those over automatically. Start with everything protected and let the user decide what to open up.

## Environment variables

Add to your `.env` file (or `.env.local` for local dev):

```env
VITE_BRIDGE_APP_ID=your-app-id-here
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_BRIDGE_APP_ID` | Yes | -- | Your Bridge application ID |
| `VITE_BRIDGE_API_BASE_URL` | No | `https://api.thebridge.dev` | Bridge API base URL (override for self-hosted or local dev) |
| `VITE_BRIDGE_DEBUG` | No | `false` | Enable debug logging in the console |

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
- `flagsStore` — `Readable<Map<string, boolean>>`

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
- [ ] `src/routes/+layout.ts` — calls `bridgeBootstrap()` with `BridgeConfig` and `RouteGuardConfig`
- [ ] `src/routes/+layout.ts` — exports `ssr = false`
- [ ] `src/routes/+layout.ts` — `BridgeConfig` includes `loginRoute` (do NOT add `signupRoute` to the config — it is not in the 0.3.x type)
- [ ] `LoginForm` is configured with `signupHref="/auth/signup"` AND `onLogin={() => goto('/')}` (or your chosen post-login destination) — without `onLogin` the user remains stuck on the login page after authenticating
- [ ] `src/routes/+layout.ts` — `defaultAccess` is `'protected'`, `/auth/*` is public
- [ ] `src/routes/+layout.svelte` — imports and renders `<BridgeBootstrap>`
- [ ] `src/routes/+layout.svelte` — imports `@nebulr-group/bridge-svelte/styles`
- [ ] `src/routes/+layout.svelte` — content wrapped in `{#if ready}` gate using `onBootstrapComplete`
- [ ] `src/routes/auth/login/+page.svelte` — file exists and renders `<LoginForm>`
- [ ] `src/routes/auth/signup/+page.svelte` — file exists and renders `<SignupForm>`
- [ ] `src/routes/auth/oauth-callback/+page.svelte` — file exists (stub page; `bridgeBootstrap` handles the code exchange)
- [ ] `src/routes/auth/set-password/[token]/+page.svelte` — file exists and renders `<ForgotPassword>` with the `token` route param **(critical — missing this breaks every signup)**
- [ ] `src/routes/auth/forgot-password/+page.svelte` — file exists and renders `<ForgotPassword>` with no token prop
- [ ] `src/routes/auth/magic-link/+page.svelte` — file exists and renders `<MagicLink>`
- [ ] `src/routes/auth/setup-passkey/[token]/+page.svelte` — file exists and renders `<PasskeySetup>` with the `token` route param
- [ ] All 7 route files match the structure shown above (correct component, correct token wiring where applicable)
- [ ] `tenantSelfSignup` is enabled on the Bridge app (server-side) — confirmed in admin dashboard or via `bridge app get`
- [ ] App origin is in `allowedOrigins` (server-side) — confirmed in admin dashboard or via `bridge app get`
- [ ] Login/logout controls added to navigation (`<a href="/auth/login">` for login; logout calls `getBridgeAuth().clearSession()` followed by `window.location.assign('/auth/login')` — do NOT call `logout()`, which redirects to the hosted Bridge page in 0.3.x)
- [ ] User display uses `$isAuthenticated` and `$profileStore` directly — NOT the `const { profile } = profileStore` destructure pattern (that pattern is invalid in 0.3.x and triggers `store_invalid_shape` in Svelte 5)
- [ ] `VITE_BRIDGE_APP_ID` set in the `.env` file
- [ ] Auth headers added to API calls that hit protected backend endpoints (using `tokenStore`)
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
6. **Login flow works:** Enter credentials and submit. The network calls should succeed AND the page should navigate away from `/auth/login` to your post-login destination. **If the network calls succeed but the page does not navigate, your `LoginForm` is missing the `onLogin` handler — it will not auto-redirect.** Add `onLogin={() => goto('/')}` (or wherever you want the user to land).
7. **Signup flow works end-to-end:** Create a new account via `/auth/signup`. Open the inbox and find the verification email. The link should point at `{your-app-origin}/auth/set-password/{token}?flow=signup`. Click it — the page should render the "Set new password" form (NOT a 404 and NOT a blank page). Set a password, confirm you land on a "password set" success state, then log in with the new credentials. **If you see a blank page or 404 after clicking the email link, the `set-password/[token]` route is missing — go back and create it.**
8. **Styles render correctly:** Bridge UI components (LoginForm, SignupForm, buttons, inputs) should have proper styling. If they appear unstyled, confirm that `@nebulr-group/bridge-svelte/styles` is imported in the root layout.
9. **Logout works in-app:** Clicking logout clears the session and lands the user on `/auth/login` of YOUR app — NOT on `auth.thebridge.dev`. If the user ends up on the hosted Bridge page, the navigation handler is calling `getBridgeAuth().logout()` instead of `clearSession()` + `window.location.assign(...)`. Switch to the `clearSession()` pattern.
10. **Forgot-password flow works end-to-end:** From the login page, click "Forgot password?" (or navigate to `/auth/forgot-password`). Enter the email of an existing user, submit, and check the inbox. Click the reset link — it should land on `/auth/set-password/{token}` and render the same "Set new password" form. Set a new password and log in with it.
11. **All seven auth routes resolve (no 404s):** With the dev server running and signed out, navigate manually to each of `/auth/login`, `/auth/signup`, `/auth/oauth-callback`, `/auth/set-password/test-token`, `/auth/forgot-password`, `/auth/magic-link`, `/auth/setup-passkey/test-token`. Every route must render its component without a 404. The set-password and setup-passkey pages will show an error state for an invalid token — that is correct; the page itself rendering is what matters here. The magic-link button and passkey button only appear inside `LoginForm` when their feature is enabled in admin config — that's expected. The standalone routes themselves must always exist.
