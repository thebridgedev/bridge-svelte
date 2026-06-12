# Bridge Svelte — Hosted Auth Quickstart

The fastest way to add authentication to your SvelteKit app. Bridge handles the entire login UI on a hosted page — you don't need to build any auth forms.

## 1. Install the plugin

```bash
npm i @nebulr-group/bridge-svelte
```

## 2. Configuration (`+layout.ts`)

Initialize Bridge in your root layout load function. For hosted auth, you only need `appId` and a `routeConfig` — no `loginRoute` is needed because Bridge redirects unauthenticated users to the hosted login page automatically.

```ts
// src/routes/+layout.ts
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
- **No `loginRoute`** — without it, Bridge redirects to the hosted login page instead of an in-app route.
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

## 4. That's it — no login page needed

With hosted auth, Bridge automatically redirects unauthenticated users to the Bridge hosted login UI. When the user completes authentication on the hosted page, they are redirected back to your app's callback URL.

You do not need to create any login or signup pages.

## 5. Add the callback route

SvelteKit requires a route file to exist so it doesn't return a 404 when Bridge redirects back to your app. Create an empty page component:

```svelte
<!-- src/routes/auth/oauth-callback/+page.svelte -->
```

This file can be completely empty. The `BridgeBootstrap` component handles the OAuth callback token exchange automatically during bootstrap.

## 6. Configuration

The `config` object you pass to `bridgeBootstrap` is a `BridgeConfig`. The most common fields:

| Field | Default | Description |
|-------|---------|-------------|
| `appId` | **(required)** | Your Bridge application ID |
| `callbackUrl` | `<origin>/auth/oauth-callback` | Where the hosted login page redirects back to |
| `defaultRedirectRoute` | `'/'` | Route to land on after login |
| `loginRoute` | — | In-app login route — leave unset for hosted auth (that's what triggers the hosted page) |
| `apiBaseUrl` | `https://api.thebridge.dev` | Root URL for the Bridge API (dev override) |
| `hostedUrl` | `https://auth.thebridge.dev` | Bridge hosted UI URL (dev override) |
| `debug` | `false` | Enable debug logging |

See the [Configuration Reference](../configuration/configuration.md) for the full list (token storage, signup route, billing routes).

Rather than hardcoding environment-specific values, keep them in a `.env` file and read them with Vite's `import.meta.env` when you build the config (the `VITE_` prefix is required for values to reach the browser):

```env
VITE_BRIDGE_APP_ID=your-app-id-here
VITE_BRIDGE_DEFAULT_REDIRECT_ROUTE=/dashboard
```

```ts
const config: BridgeConfig = {
  appId: import.meta.env.VITE_BRIDGE_APP_ID,
  defaultRedirectRoute: import.meta.env.VITE_BRIDGE_DEFAULT_REDIRECT_ROUTE ?? '/',
};
```

## Next steps

- **In-app auth forms** — If you want to embed login/signup forms directly in your app instead of using the hosted page, see the [SDK Auth Guide](../sdk-auth/sdk-quickstart.md).
- **Theming** — Customize the look of Bridge components with CSS variables and overrides. See [Theming & Styles](../theming/theming.md).
- **Feature flags, payments, team management** — See the [examples index](../examples/examples.md) for links to all feature guides.
