# SDK auth quickstart

> This guide covers in-app SDK auth components. For the simplest setup using Bridge's hosted login page, see the [Hosted auth quickstart](../quickstart/hosted-quickstart.md).

Get up and running with The Bridge Svelte plugin using in-app SDK auth components, with no redirects to external login pages.

## 1. Install the plugin

```bash
npm i @nebulr-group/bridge-svelte
```

Optional peer dependencies (install only if you need the feature):

| Package | When needed |
|---------|-------------|
| `@stripe/stripe-js` | Paid subscription plans (Stripe Checkout) |

Passkey (WebAuthn) support (`@simplewebauthn/browser`) is bundled with the plugin — no extra install.

Before wiring the routes, enable the auth methods you want on your Bridge app (password, magic link, passkeys, SSO providers) — components only render a method's UI when the app has it enabled:

```bash
bridge app update --magic-link-enabled true --passkeys-enabled true
```

## 2. Configuration (`+layout.ts`)

Initialize Bridge in your root layout load function. The `BridgeConfig` object tells Bridge your `appId` and where your login page lives. The `routeConfig` defines which routes are public and which require authentication.

```ts
// src/routes/+layout.ts
import type { LayoutLoad } from './$types';
import type { BridgeConfig, RouteGuardConfig } from '@nebulr-group/bridge-svelte';
import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';

export const ssr = false;

export const load: LayoutLoad = async ({ url }) => {
  const config: BridgeConfig = {
    appId: import.meta.env.VITE_BRIDGE_APP_ID,
    loginRoute: '/auth/login',
    // The SDK reads no environment variables. Pass the API URL from your own
    // env; without it every request goes to production (https://api.thebridge.dev).
    apiBaseUrl: import.meta.env.VITE_BRIDGE_API_BASE_URL || undefined,
  };

  const routeConfig: RouteGuardConfig = {
    rules: [
      { match: '/', public: true },
      { match: new RegExp('^/auth($|/)'), public: true },
    ],
    defaultAccess: 'protected',
  };

  await bridgeBootstrap(url, config, routeConfig);
  return {};
};
```

Key points:
- **`loginRoute`**: tells Bridge where to redirect unauthenticated users (your in-app login page).
- **`apiBaseUrl`**: required for any non-production app (stage, local, self-hosted). The SDK never reads `import.meta.env`; without `apiBaseUrl` a stage or local app ID talks to the production API and fails with "Not Found".
- **`defaultAccess: 'protected'`**: all routes require auth unless explicitly marked `public`.
- **`ssr = false`**: Bridge requires client-side rendering.

## 3. Bootstrap component (`+layout.svelte`)

Add the `BridgeBootstrap` component to your root layout. Use the `onBootstrapComplete` callback to hide content until auth state is resolved.

```svelte
<!-- src/routes/+layout.svelte -->
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

## 4. Create a login page

Drop the `LoginForm` component onto a page that matches your `loginRoute`.

```svelte
<!-- src/routes/auth/login/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { LoginForm, readReturnTo } from '@nebulr-group/bridge-svelte';

  function onLogin() {
    // Back to the page the visitor asked for (validated), else your default.
    goto(readReturnTo($page.url) ?? '/');
  }
</script>

<div class="login-page">
  <LoginForm showSignupLink {onLogin} />
</div>

<!-- Optional: center the form on the page. Not required for the component to work. -->
<style>
  .login-page {
    display: flex;
    justify-content: center;
    padding: 3rem 1rem;
  }
</style>
```

**`onLogin` is required.** `LoginForm` does not navigate after a successful sign-in; it calls `onLogin` and your page decides where to go. Without it the user stays on the login page. When the route guard sends a signed-out visitor here it attaches the page they asked for as `?redirectUri=…`; `readReturnTo` reads it back and returns `null` for anything that is not a same-origin path, so never read the parameter yourself (see [Returning to the page they asked for](/auth/securing/route-guards/#returning-to-the-page-they-asked-for)).

Auth method visibility (magic link, passkeys, SSO) is derived from your app's configuration in the Control Center (your admin dashboard at app.thebridge.dev).

`LoginForm` handles multi-step flows inline: forgot password, magic link requests, passkey login, MFA challenge, MFA setup, and workspace selection (a workspace is called a *tenant* in the API) all render within the same component automatically when needed.

**Optional props:** `onError` (fires on auth failure), `signupHref` (overrides the `signupRoute` config for this form's signup link).

## 5. Create a signup page

```svelte
<!-- src/routes/auth/signup/+page.svelte -->
<script lang="ts">
  import { SignupForm } from '@nebulr-group/bridge-svelte';
</script>

<div class="signup-page">
  <SignupForm showLoginLink loginHref="/auth/login" />
</div>

<!-- Optional: center the form on the page. -->
<style>
  .signup-page {
    display: flex;
    justify-content: center;
    padding: 3rem 1rem;
  }
</style>
```

After a successful signup the user receives a verification email. Once verified, they can sign in.

**Optional props:** `onSignup` (fires after successful signup), `onError` (fires on failure).

## 6. Styles

See [Theming & Styles](../theming/theming.md) for customization options.

## 7. Configuration

The `config` object you pass to `bridgeBootstrap` is a `BridgeConfig`. The most common fields:

| Field | Default | Description |
|-------|---------|-------------|
| `appId` | **(required)** | Your Bridge app ID |
| `loginRoute` | (unset) | In-app route of your login page; unauthenticated users are redirected here |
| `signupRoute` | `'/auth/signup'` | In-app route of your signup page; `LoginForm`'s signup link points here |
| `apiBaseUrl` | `https://api.thebridge.dev` | Root URL for the Bridge API — required for any non-production app (stage, local, self-hosted) |
| `hostedUrl` | `https://auth.thebridge.dev` | Bridge hosted UI URL (non-production override) |
| `debug` | `false` | Enable debug logging |

Where a user lands after sign-in is decided by your `onLogin` (above), not by a config field.

See the [Configuration reference](/auth/config/) for the full list (token storage, billing routes).

Rather than hardcoding environment-specific values, keep them in a `.env` file and read them with Vite's `import.meta.env` when you build the config (the `VITE_` prefix is required for values to reach the browser). The SDK itself reads no environment variables — a variable you don't pass into the config does nothing:

```env
VITE_BRIDGE_APP_ID=your-app-id-here
# Only for a non-production app (stage, local, self-hosted):
# VITE_BRIDGE_API_BASE_URL=https://api-stage.thebridge.dev
```

```ts
const config: BridgeConfig = {
  appId: import.meta.env.VITE_BRIDGE_APP_ID,
  loginRoute: '/auth/login',
  apiBaseUrl: import.meta.env.VITE_BRIDGE_API_BASE_URL || undefined,
};
```

## 8. Logging out — stay in YOUR app

Always pass `redirectTo` when calling `logout()` in SDK mode:

```svelte
<button onclick={() => getBridgeAuth().logout({ redirectTo: '/auth/login' })}>
  Log out
</button>
```

Without `redirectTo`, `logout()` sends the user to the **hosted Bridge portal**
(`hostedUrl`, default `auth.thebridge.dev`) instead of your in-app login page —
which is almost never what an SDK-mode app wants.

## Next steps

- **More auth UI components**: [MFA](/auth/ui/mfa/), [passkeys](/auth/ui/passkeys/), [magic link](/auth/ui/magic-link/), [SSO login button](/auth/ui/google-sso/), [switching workspaces](/auth/ui/switching-workspaces/), and [user & team management](/auth/ui/team-management/).
- **The user token**: [logging in and logging out](/auth/user-token/logging-in-and-out/), [getting the token](/auth/user-token/getting-the-token/), and [auth states](/auth/user-token/auth-states/).
- **Route protection**: [frontend route guards](/auth/securing/route-guards/), or browse the full [Auth](/auth/) section.
- **Feature flags and billing**: [how flags work](/feature-flags/how-it-works/) and [how billing works](/billing/how-it-works/).
