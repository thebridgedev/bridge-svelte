# Bridge SvelteKit Integration — SDK Auth

You are integrating The Bridge into a SvelteKit application using **in-app SDK authentication**. Instead of redirecting users to an external hosted login page, the app renders its own login and signup forms using Bridge SDK components (`LoginForm`, `SignupForm`). Users never leave the app.

## Prerequisites

- **appId** — your Bridge application ID. Get it from `bridge app get` or the Bridge dashboard.
- **Package manager** — use whatever the project already uses (check for `bun.lock`, `pnpm-lock.yaml`, `yarn.lock`, or `package-lock.json`).

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
    signupRoute: '/auth/signup',
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
- `signupRoute` tells Bridge where your signup page lives. `LoginForm` uses this to generate the "Sign up" link.
- `defaultAccess: 'protected'` means all routes require login unless marked `public`.
- `/auth/*` must be public so the login and signup pages are accessible to unauthenticated users.
- The `appId` comes from the `VITE_BRIDGE_APP_ID` environment variable.

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

## Create the login page

Create `src/routes/auth/login/+page.svelte`:

```svelte
<script lang="ts">
  import { LoginForm } from '@nebulr-group/bridge-svelte';
</script>

<div class="login-page">
  <LoginForm showSignupLink />
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
- No callbacks needed — the route guard handles post-login redirect automatically. After successful login, Bridge redirects the user to the route they originally requested (or `defaultRedirectRoute` which defaults to `/`).
- Auth method visibility (password, magic link, passkeys, SSO) is derived from your app's configuration in the Bridge dashboard. You don't need to configure this in code.
- `LoginForm` handles multi-step flows inline: forgot password, magic link requests, passkey login, MFA challenge, MFA setup, and tenant selection all render within the same component automatically when needed.
- `showSignupLink` renders a "Sign up" link that navigates to the `signupRoute` from your `BridgeConfig`. You can override the URL with the `signupHref` prop if needed.

**Optional props:** `onLogin` (fires after successful auth — useful for analytics), `onError` (fires on auth failure), `signupHref` (override the signup link URL).

## Create the signup page

Create `src/routes/auth/signup/+page.svelte`:

```svelte
<script lang="ts">
  import { SignupForm } from '@nebulr-group/bridge-svelte';
</script>

<div class="signup-page">
  <SignupForm showLoginLink />
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
- `showLoginLink` renders a "Log in" link that navigates to the `loginRoute` from your `BridgeConfig`. You can override the URL with the `loginHref` prop if needed.
- After a successful signup, the user receives a verification email. Once verified, they can log in.

**Optional props:** `onSignup` (fires after successful signup), `onError` (fires on failure), `loginHref` (override the login link URL).

## Convert to SDK auth (existing hosted setup)

If the project already has Bridge hosted (redirect) auth set up and you want to convert to in-app SDK auth:

### 1. Add `loginRoute` and `signupRoute` to your `BridgeConfig`

In `src/routes/+layout.ts`, update the config object:

```ts
const config: BridgeConfig = {
  appId: import.meta.env.VITE_BRIDGE_APP_ID,
  loginRoute: '/auth/login',
  signupRoute: '/auth/signup',
};
```

These two properties are what switches Bridge from hosted auth to SDK auth. When `loginRoute` is set, the route guard redirects to your in-app page instead of the external hosted login.

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

  const { profile } = profileStore;
</script>

{#if $isAuthenticated}
  <span>{$profile?.fullName ?? $profile?.email}</span>
  <button onclick={() => getBridgeAuth().logout({ redirectTo: '/' })}>Log out</button>
{:else}
  <a href="/auth/login">Log in</a>
{/if}
```

**Key points:**
- With SDK auth, the "Log in" action is a simple link to `/auth/login` — no JavaScript call needed.
- `getBridgeAuth().logout()` clears tokens and session state. The optional `redirectTo` parameter controls where the user lands after logout.
- `isAuthenticated` is a Svelte readable store — use `$isAuthenticated` in templates.
- **Important:** `profileStore` is an object containing stores, not a store itself. You must destructure it first: `const { profile } = profileStore;` then use `$profile` in templates. Do NOT use `$profileStore` directly — it will throw a `store_invalid_shape` error in Svelte 5.

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

  const { profile } = profileStore;
</script>

{#if $isAuthenticated}
  <p>Welcome, {$profile?.fullName}</p>
  <p>Email: {$profile?.email}</p>
  <p>Tenant: {$profile?.tenant?.name}</p>
{/if}
```

**Available stores:**
- `isAuthenticated` — `Readable<boolean>`
- `profileStore.profile` — `Readable<{ fullName, email, tenant, onboarded, ... } | null>`
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
- [ ] `src/routes/+layout.ts` — `BridgeConfig` includes `loginRoute` and `signupRoute`
- [ ] `src/routes/+layout.ts` — `defaultAccess` is `'protected'`, `/auth/*` is public
- [ ] `src/routes/+layout.svelte` — imports and renders `<BridgeBootstrap>`
- [ ] `src/routes/+layout.svelte` — imports `@nebulr-group/bridge-svelte/styles`
- [ ] `src/routes/+layout.svelte` — content wrapped in `{#if ready}` gate using `onBootstrapComplete`
- [ ] `src/routes/auth/login/+page.svelte` — file exists and renders `<LoginForm>`
- [ ] `src/routes/auth/signup/+page.svelte` — file exists and renders `<SignupForm>`
- [ ] Login/logout controls added to navigation (`<a href="/auth/login">` for login, `getBridgeAuth().logout()` for logout)
- [ ] User display using `isAuthenticated` store and `profileStore` (destructured correctly)
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
6. **Login flow works:** Enter credentials and complete login. You should be redirected to the page you originally requested (or `/` by default).
7. **Signup flow works:** Create a new account via the signup form. A verification email should be sent.
8. **Styles render correctly:** Bridge UI components (LoginForm, SignupForm, buttons, inputs) should have proper styling. If they appear unstyled, confirm that `@nebulr-group/bridge-svelte/styles` is imported in the root layout.
9. **Logout works:** Clicking logout clears the session and redirects to the specified route.
