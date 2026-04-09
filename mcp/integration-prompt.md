# Bridge SvelteKit Integration — Redirect Auth

You are integrating The Bridge into a SvelteKit application using the **redirect-based (hosted) auth flow**. Users are redirected to the Bridge hosted login page and returned to the app after authentication.

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

No peer dependencies are required for the redirect auth flow.

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
- `defaultAccess: 'protected'` means all routes require login unless marked `public`.
- `/auth/*` must be public so the OAuth callback route is accessible.
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
- `BridgeBootstrap` handles the OAuth callback automatically (detects `?code=` on the callback URL).
- Content is hidden until `onBootstrapComplete` fires, preventing flash of protected content.
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

If the Bridge CLI is not available, these values can also be set in the Bridge dashboard under App Settings, or directly in the database (`apps` collection: `redirectUris`, `allowedOrigins`, `defaultCallbackUri`, `uiUrl` fields).

## Add login and logout

The redirect flow uses `auth.login()` to send the user to the hosted Bridge login page, and `auth.logout()` to clear the session.

Add buttons to your navigation or header component:

```svelte
<script lang="ts">
  import { auth, isAuthenticated, profileStore } from '@nebulr-group/bridge-svelte';

  const { profile } = profileStore;
</script>

{#if $isAuthenticated}
  <span>{$profile?.fullName ?? $profile?.email}</span>
  <button onclick={() => auth.logout()}>Log out</button>
{:else}
  <button onclick={() => auth.login()}>Log in</button>
{/if}
```

**How it works:**
- `auth.login()` redirects to the Bridge hosted login page. After login, the user is redirected back to your app's callback URL (default: `{origin}/auth/oauth-callback`).
- `auth.logout()` clears tokens and redirects to the Bridge hosted logout page.
- `isAuthenticated` is a Svelte readable store — use `$isAuthenticated` in templates.
- **Important:** `profileStore` is an object containing stores, not a store itself. You must destructure it first: `const { profile } = profileStore;` then use `$profile` in templates. Do NOT use `$profileStore` directly — it will throw a `store_invalid_shape` error in Svelte 5.

## Route protection

Routes are protected via the `RouteGuardConfig` passed to `bridgeBootstrap()`.

**Config structure:**

```ts
const routeConfig: RouteGuardConfig = {
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
};
```

**Rule matching:**
- `match` accepts a string (exact prefix match) or `RegExp`.
- `public: true` allows unauthenticated access.
- `featureFlag` requires the user to be logged in AND have the flag enabled.
- `redirectTo` specifies where to send users who don't meet the requirement (defaults to the login route).

**When an unauthenticated user hits a protected route:**
- They are redirected to the Bridge hosted login page.
- After login, they are returned to the app's callback URL, then redirected to the home page (`/`).

**Default: protect everything.** The only route that must be public is `/auth/*` (the OAuth callback lives there). All other routes should be protected by default. The user can relax this later for specific pages (landing, search, docs, etc.) using the CLI or by editing the route config directly.

**Detecting existing public route config:**
- If the app has an existing public route config (e.g., `PUBLIC_ROUTES` array), do NOT carry those over automatically. Start with everything protected and let the user decide what to open up.
  
## Environment variables

Add to your `.env` file (or `.env.local` for local dev):

```env
VITE_BRIDGE_APP_ID=your-app-id-here
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_BRIDGE_APP_ID` | Yes | — | Your Bridge application ID |
| `VITE_BRIDGE_API_BASE_URL` | No | `https://api.thebridge.dev` | Bridge API base URL |
| `VITE_BRIDGE_HOSTED_URL` | No | `https://auth.thebridge.dev` | Bridge hosted UI URL (login page) |
| `VITE_BRIDGE_DEBUG` | No | `false` | Enable debug logging in the console |

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
- [ ] `src/routes/+layout.ts` — `defaultAccess` is `'protected'`, only `/auth/*` is public
- [ ] `src/routes/+layout.svelte` — imports and renders `<BridgeBootstrap>`
- [ ] `src/routes/+layout.svelte` — imports `@nebulr-group/bridge-svelte/styles`
- [ ] `src/routes/+layout.svelte` — content wrapped in `{#if ready}` gate using `onBootstrapComplete`
- [ ] `src/routes/auth/oauth-callback/+page.svelte` — file exists (even if minimal)
- [ ] Bridge app configured: `redirect-uris` includes the callback URL, `allowed-origins` includes the frontend origin
- [ ] Login/logout buttons added to nav using `auth.login()` and `auth.logout()`
- [ ] User display using `isAuthenticated` store and `profileStore`
- [ ] `VITE_BRIDGE_APP_ID` set in the `.env` file
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
