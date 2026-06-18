# Bridge Svelte — SDK Auth Guide

> This guide covers in-app SDK auth components. For the simplest setup using Bridge's hosted login page, see the [Hosted Auth Quickstart](../quickstart/hosted-quickstart.md).

Get up and running with The Bridge Svelte plugin using in-app SDK auth components — no redirects to external login pages.

## 1. Install the plugin

```bash
npm i @nebulr-group/bridge-svelte
```

Optional peer dependencies (install only if you need the feature):

| Package | When needed |
|---------|-------------|
| `@stripe/stripe-js` | Paid subscription plans (Stripe Checkout) |
| `@simplewebauthn/browser` | Passkey (WebAuthn) authentication |

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
- **`loginRoute`** — tells Bridge where to redirect unauthenticated users (your in-app login page).
- **`defaultAccess: 'protected'`** — all routes require auth unless explicitly marked `public`.
- **`ssr = false`** — Bridge requires client-side rendering.

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
  import { LoginForm } from '@nebulr-group/bridge-svelte';
</script>

<div class="login-page">
  <LoginForm showSignupLink />
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

That's it — no callbacks needed. The route guard handles post-login redirect automatically. Auth method visibility (magic link, passkeys, SSO) is derived from your app's configuration in the Bridge dashboard.

`LoginForm` handles multi-step flows inline: forgot password, magic link requests, passkey login, MFA challenge, MFA setup, and tenant selection all render within the same component automatically when needed.

**Optional props:** `onLogin` (fires after successful auth — useful for analytics), `onError` (fires on auth failure).

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

After a successful signup the user receives a verification email. Once verified, they can log in.

**Optional props:** `onSignup` (fires after successful signup), `onError` (fires on failure).

## 6. Styles

See [Theming & Styles](../theming/theming.md) for customization options.

## 7. Configuration

The `config` object you pass to `bridgeBootstrap` is a `BridgeConfig`. The most common fields:

| Field | Default | Description |
|-------|---------|-------------|
| `appId` | **(required)** | Your Bridge application ID |
| `loginRoute` | — | In-app route of your login page — unauthenticated users are redirected here |
| `signupRoute` | — | In-app route of your signup page |
| `defaultRedirectRoute` | `'/'` | Route to land on after login |
| `apiBaseUrl` | `https://api.thebridge.dev` | Root URL for the Bridge API (dev override) |
| `hostedUrl` | `https://auth.thebridge.dev` | Bridge hosted UI URL (dev override) |
| `debug` | `false` | Enable debug logging |

See the [Configuration Reference](../configuration/configuration.md) for the full list (token storage, billing routes).

Rather than hardcoding environment-specific values, keep them in a `.env` file and read them with Vite's `import.meta.env` when you build the config (the `VITE_` prefix is required for values to reach the browser):

```env
VITE_BRIDGE_APP_ID=your-app-id-here
VITE_BRIDGE_DEFAULT_REDIRECT_ROUTE=/dashboard
```

```ts
const config: BridgeConfig = {
  appId: import.meta.env.VITE_BRIDGE_APP_ID,
  loginRoute: '/auth/login',
  defaultRedirectRoute: import.meta.env.VITE_BRIDGE_DEFAULT_REDIRECT_ROUTE ?? '/',
};
```

## Next steps

See the [examples documentation](../examples/examples.md) for detailed coverage of:

- All SDK auth components (MFA, passkeys, magic link, SSO, tenant/workspace selection)
- Feature flags and route-level gating
- Payments and subscriptions
- Team management
- API token management
- Configuration reference
