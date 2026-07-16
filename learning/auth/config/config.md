---
title: Configurations
description: The BridgeConfig options you pass to bridgeBootstrap, and the app settings managed in Control Center.
sidebar:
  label: Svelte
---
import { Tabs, TabItem } from '@astrojs/starlight/components';

# Configurations

The config object you pass to `bridgeBootstrap` controls how Bridge wires up auth, routing, and billing in your app. See [all config options](#all-config-options) for the full list.

## Passing configs to Bridge

Call `bridgeBootstrap()` from your root `+layout.ts` load function, passing it a `BridgeConfig` object. The app ID comes from Control Center (your admin dashboard at app.thebridge.dev): open your app's settings and copy its ID into your `.env`.

```typescript
// src/routes/+layout.ts
import type { LayoutLoad } from './$types';
import type { BridgeConfig, RouteGuardConfig } from '@nebulr-group/bridge-svelte';
import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';

export const ssr = false;

export const load: LayoutLoad = async ({ url, fetch }) => {
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

  await bridgeBootstrap(url, config, routeConfig, fetch);
  return {};
};
```

Signature:

```typescript
bridgeBootstrap(
  url: URL,                       // the current URL from the load function
  config: BridgeConfig | string,  // config object, or just the appId as a string
  routeConfig?: RouteGuardConfig, // default: { rules: [], defaultAccess: 'protected' }
  kitFetch?: typeof fetch         // pass SvelteKit's fetch for SSR-safe requests
)
```

Bootstrap is idempotent: calling it again after it has completed is a no-op.

## Reading the resolved config

Read the active config at runtime via the `readonlyConfig` store:

```svelte
<script lang="ts">
  import { readonlyConfig } from '@nebulr-group/bridge-svelte';

  const config = $derived($readonlyConfig);
</script>

{#if config}
  <p>App ID: {config.appId}</p>
  <p>Login route: {config.loginRoute}</p>
{/if}
```

## Callback URL

`callbackUrl` is the URL Bridge calls back to once a login completes. If you omit it, the default callback URL set in Control Center is used instead.

Passing a specific `callbackUrl` lets you send different parts of your app through different post-login destinations, for example an admin section and a regular user section of the same app, or entirely separate apps sharing one Bridge project.

Whatever you pass here must already be registered as an allowed redirect URI in Control Center (see [Configs managed in Control Center](#configs-managed-in-control-center)); Bridge only redirects to callback URLs it's been told about.

```typescript
const config: BridgeConfig = {
  appId: import.meta.env.VITE_BRIDGE_APP_ID,
  callbackUrl: `${window.location.origin}/admin/oauth-callback`,
};
```

## Base URLs

Two options point the SDK at Bridge itself. You only change them if you're on a dedicated or self-hosted Bridge environment; on the standard cloud, leave them alone.

- **`apiBaseUrl`** (default `https://api.thebridge.dev`): the base URL for the Bridge API. Every API endpoint the SDK calls is derived from it.
- **`hostedUrl`** (default `https://auth.thebridge.dev`): the base URL for Bridge's hosted UI, such as the hosted login page and plan selection.

## Login route

If you set `loginRoute`, unauthenticated users who hit a protected route are redirected to that in-app route, where your own login page (for example, one built with [`LoginForm`](/auth/ui/email-password/)) takes over.

If you leave `loginRoute` unset, Bridge uses hosted auth instead: unauthenticated users are redirected to Bridge's hosted login page (served from `hostedUrl`). Unset is the default, so hosted login is what you get out of the box.

## All config options

| Option | Type | Default | Description |
|--------|------|---------|--------------|
| `appId` | `string` | (required) | Your Bridge app ID, found in your app's settings in Control Center |
| `apiBaseUrl` | `string` | `'https://api.thebridge.dev'` | Base URL for the Bridge API; all endpoints are derived from it. See [Base URLs](#base-urls) |
| `hostedUrl` | `string` | `'https://auth.thebridge.dev'` | Base URL for Bridge's hosted UI (login page, plan selection). See [Base URLs](#base-urls) |
| `callbackUrl` | `string` | `${origin}/auth/oauth-callback` | Where the login flow redirects back to after a successful login. See [Callback URL](#callback-url) |
| `defaultRedirectRoute` | `string` | `'/'` | Route to redirect to after login |
| `loginRoute` | `string` | (unset) | In-app route of your login page. Leave unset for hosted auth: without it, unauthenticated users go to Bridge's hosted login page. See [Login route](#login-route) |
| `signupRoute` | `string` | `'/auth/signup'` | Route where your signup page lives; `LoginForm`'s signup link points here unless its `signupHref` prop overrides it |
| `billing.paywallRoute` | `string` | (none) | Route to redirect to when the workspace (called a *tenant* in the API) has no plan selected |
| `billing.paymentErrorRoute` | `string` | `'/payment-error'` | Route to redirect to when a Stripe checkout confirmation fails |
| `storage` | `TokenStorage` | `localStorage` (browser) / memory (SSR) | Token storage adapter; implement `get`/`set`/`remove` to bring your own |
| `debug` | `boolean` | `false` | Enable debug logging |

## Route guard config

The third argument to `bridgeBootstrap` declares which routes are public, protected, flag-gated, or billing-gated:

```typescript
interface RouteGuardConfig {
  rules: RouteRule[];
  /** Access for routes no rule matches. @default 'protected' */
  defaultAccess?: 'public' | 'protected';
}

interface RouteRule {
  /** Path to match: exact string or RegExp. */
  match: string | RegExp;
  /** Route is accessible without authentication. */
  public?: boolean;
  /** Require feature flag(s): a key, { any: [...] }, or { all: [...] }. */
  featureFlag?: string | { any: string[] } | { all: string[] };
  /** Where to send users who fail the featureFlag requirement. @default '/' */
  redirectTo?: string;
  /** Billing gate. 'soft' (default) renders the route and relies on the
   *  in-app notice; 'hard' redirects a billing-locked workspace to its
   *  recovery URL. */
  billing?: 'soft' | 'hard';
}
```

See [Route guards](/auth/securing/route-guards/) for a walkthrough.

## Passing values via .env

> **Tip:** this is just a best practice, not a requirement. Keep environment-specific values in a `.env` file instead of hardcoding them, and read them with Vite's `import.meta.env` when you build the config. The `VITE_` prefix is required for values to reach the browser; the SDK does not read environment variables automatically.

<Tabs>
<TabItem label=".env">

```env
VITE_BRIDGE_APP_ID=your-app-id-here
VITE_BRIDGE_LOGIN_ROUTE=/auth/login
VITE_BRIDGE_DEFAULT_REDIRECT_ROUTE=/dashboard
```

</TabItem>
<TabItem label="+layout.ts">

```typescript
const config: BridgeConfig = {
  appId: import.meta.env.VITE_BRIDGE_APP_ID,
  loginRoute: import.meta.env.VITE_BRIDGE_LOGIN_ROUTE,
  defaultRedirectRoute: import.meta.env.VITE_BRIDGE_DEFAULT_REDIRECT_ROUTE ?? '/',
  debug: import.meta.env.DEV,
};
```

</TabItem>
</Tabs>

## Configs managed in Control Center

Some settings aren't passed in code at all. They're set once per app, and Bridge enforces them server-side:

| Setting | What it does |
|---------|---------------|
| Redirect URIs | The allowlist of callback URLs Bridge is allowed to redirect to. Any `callbackUrl` you pass to `bridgeBootstrap` must already be on this list. |
| Allowed origins | The CORS allowlist: origins permitted to call the Bridge API directly from the browser. |
| Default callback URL | Used whenever your app doesn't pass a `callbackUrl` in code. See [Callback URL](#callback-url). |

- **CLI:**

  ```bash
  bridge app update \
    --redirect-uris "https://app.example.com/oauth-callback,https://admin.example.com/oauth-callback" \
    --allowed-origins "https://app.example.com,https://admin.example.com" \
    --default-callback-uri "https://app.example.com/oauth-callback"
  ```

- **Control Center:** the same settings, managed from your app's settings.
- **MCP (AI-assistant integration):** coming soon.
