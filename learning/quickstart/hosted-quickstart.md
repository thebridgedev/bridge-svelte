# Hosted auth quickstart

The fastest way to add authentication to your SvelteKit app. Bridge handles the entire login UI on a hosted page, so you don't need to build any auth forms.

## 1. Install the plugin

```bash
npm i @nebulr-group/bridge-svelte
```

## 2. Configuration (`+layout.ts`)

Start Bridge from your root layout with one call. The app id comes from `VITE_BRIDGE_APP_ID` in your `.env` (see step 6); for hosted auth you only add route rules. No `loginRoute` is needed because Bridge redirects unauthenticated users to the hosted login page automatically.

```ts
// src/routes/+layout.ts
import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';

export const ssr = false;

export const load = bridgeBootstrap({
  rules: [
    { match: '/', public: true },
    { match: new RegExp('^/auth($|/)'), public: true },
  ],
  defaultAccess: 'protected',
});
```

Key points:
- **No `loginRoute`**: without it, Bridge redirects to the hosted login page instead of an in-app route.
- **`defaultAccess: 'protected'`**: all routes require auth unless explicitly marked `public`.
- **`ssr = false`**: Bridge requires client-side rendering.

## 3. Bootstrap component (`+layout.svelte`)

Wrap your app in the `BridgeBootstrap` component. It renders its children only once Bridge is ready, so you write no loading logic yourself.

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { BridgeBootstrap } from '@nebulr-group/bridge-svelte';
  import '@nebulr-group/bridge-svelte/styles';

  let { children } = $props();
</script>

<BridgeBootstrap>
  {@render children()}
</BridgeBootstrap>
```

## 4. Add the callback route

SvelteKit requires a route file to exist so it doesn't return a 404 when Bridge redirects back to your app. Create an empty page component:

```svelte
<!-- src/routes/auth/oauth-callback/+page.svelte -->
```

This file can be completely empty. The `BridgeBootstrap` component handles the OAuth callback token exchange automatically during bootstrap.

## 5. That's it: no login page needed

With hosted auth, Bridge automatically redirects unauthenticated users to the Bridge hosted login UI. When the user completes authentication on the hosted page, they are redirected back to the callback route you created in step 4.

You do not need to create any login or signup pages.

## 6. Configuration

The options you pass to `bridgeBootstrap` are `BridgeConfig` fields plus your route rules. The most common fields:

| Field | Default | Description |
|-------|---------|-------------|
| `appId` | `VITE_BRIDGE_APP_ID` **(required)** | Your Bridge app ID |
| `callbackUrl` | `<origin>/auth/oauth-callback` | Where the hosted login page redirects back to |
| `loginRoute` | (unset) | In-app login route; leave unset for hosted auth (that's what triggers the hosted page) |
| `apiBaseUrl` | `VITE_BRIDGE_API_BASE_URL`, else `https://api.thebridge.dev` | Root URL for the Bridge API — set it for any non-production app (stage, local, self-hosted) |
| `hostedUrl` | `VITE_BRIDGE_HOSTED_URL`, else derived from the API address on Bridge's own domains, else `https://auth.thebridge.dev` | Bridge hosted UI URL (local or self-hosted override) |
| `debug` | `VITE_BRIDGE_DEBUG === 'true'`, else `false` | Enable debug logging |

See the [Configuration reference](/auth/config/) for the full list (token storage, signup route, billing routes).

After the hosted login the user returns to the page they were heading to, or `/` when there was none.

Bridge reads its settings from these variables in your `.env` file (the `VITE_` prefix is required for values to reach the browser). Anything you pass to `bridgeBootstrap()` explicitly wins over the environment, and the environment wins over the default:

```env
VITE_BRIDGE_APP_ID=your-app-id-here
# Only for a non-production app (stage, local, self-hosted):
# VITE_BRIDGE_API_BASE_URL=https://api-stage.thebridge.dev
# Only for a local or self-hosted Bridge (stage's hosted pages follow the API address):
# VITE_BRIDGE_HOSTED_URL=http://localhost:3091
```

With no app id anywhere, Bridge refuses to start and names `VITE_BRIDGE_APP_ID`. A production app sets only the app id; in a development build Bridge warns once in the console when it is using production because `VITE_BRIDGE_API_BASE_URL` is unset.

## Next steps

- **In-app auth forms**: if you want to embed login/signup forms directly in your app instead of using the hosted page, see the [SDK auth quickstart](../sdk-auth/sdk-quickstart.md).
- **Theming**: customize the look of Bridge components with CSS variables and overrides. See [Theming & Styles](../theming/theming.md).
- **Going further**: add [feature flags](/feature-flags/how-it-works/), [billing and subscriptions](/billing/how-it-works/), or explore the full [Auth](/auth/) section.
