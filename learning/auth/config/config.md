---
title: Configurations
description: The BridgeConfig options you pass to bridgeBootstrap.
sidebar:
  label: Svelte
---
import { Tabs, TabItem } from '@astrojs/starlight/components';

# Configurations

The config object you pass to `bridgeBootstrap` — every option in one place:

| Option | Type | Default | Description |
|--------|------|---------|--------------|
| `appId` | `string` | — (required) | Your Bridge application ID |
| `apiBaseUrl` | `string` | `'https://api.thebridge.dev'` | Base URL for the Bridge API. All API endpoints are derived from this |
| `hostedUrl` | `string` | `'https://auth.thebridge.dev'` | Base URL for Bridge's hosted UI (login page, plan selection, etc.) |
| `callbackUrl` | `string` | `${origin}/auth/oauth-callback` | Where the login flow redirects back to after a successful login |
| `defaultRedirectRoute` | `string` | `'/'` | Route to redirect to after login |
| `loginRoute` | `string` | `'/login'` | Route to redirect to when authentication fails |
| `signupRoute` | `string` | — | Route where your signup page lives; `LoginForm` links to it when set |
| `billing.paywallRoute` | `string` | — | Route to redirect to when the tenant has no plan selected |
| `billing.paymentErrorRoute` | `string` | `'/payment-error'` | Route to redirect to when a Stripe checkout confirmation fails |
| `storage` | `TokenStorage` | `localStorage` (browser) / memory (SSR) | Token storage adapter — implement `get`/`set`/`remove` to bring your own |
| `debug` | `boolean` | `false` | Enable debug logging |

The sections below cover the ones worth a closer look — everything else is used exactly as it reads in the table above.

## Allowed URLs

`apiBaseUrl` and `hostedUrl` are the two you're most likely to override — for example, pointing at a region-specific or self-hosted Bridge deployment instead of the defaults above.

## Callback URLs

`callbackUrl` and `defaultRedirectRoute` control what happens right after login: `callbackUrl` is where the OAuth/SSO flow itself lands, `defaultRedirectRoute` is where the user ends up once that's done.

## Other configs

### bridgeBootstrap()

Call it from your root `+layout.ts` load function:

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

Bootstrap is idempotent — calling it again after it has completed is a no-op.

### Passing values via .env

Keep environment-specific values in a `.env` file instead of hardcoding them, and read them with Vite's `import.meta.env` when you build the config. The `VITE_` prefix is required for values to reach the browser; the SDK does not read environment variables automatically.

<Tabs>
<TabItem label=".env">

```env
VITE_BRIDGE_APP_ID=your-app-id-here
VITE_BRIDGE_API_BASE_URL=https://api.thebridge.dev
VITE_BRIDGE_DEFAULT_REDIRECT_ROUTE=/dashboard
```

</TabItem>
<TabItem label="+layout.ts">

```typescript
const config: BridgeConfig = {
  appId: import.meta.env.VITE_BRIDGE_APP_ID,
  apiBaseUrl: import.meta.env.VITE_BRIDGE_API_BASE_URL,
  defaultRedirectRoute: import.meta.env.VITE_BRIDGE_DEFAULT_REDIRECT_ROUTE ?? '/',
  debug: import.meta.env.DEV,
};
```

</TabItem>
</Tabs>

### Reading the resolved config

Read the active config at runtime via the `readonlyConfig` store:

```svelte
<script lang="ts">
  import { readonlyConfig } from '@nebulr-group/bridge-svelte';

  const config = $derived($readonlyConfig);
</script>

{#if config}
  <p>App ID: {config.appId}</p>
  <p>API Base: {config.apiBaseUrl}</p>
{/if}
```
