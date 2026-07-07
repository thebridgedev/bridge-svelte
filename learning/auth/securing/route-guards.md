---
title: Route guards
description: Frontend route guards for Svelte.
sidebar:
  label: Svelte
---
import { Tabs, TabItem } from '@astrojs/starlight/components';

# Route guards

Pass `routeConfig` as the third argument to `bridgeBootstrap` in `+layout.ts`. The `BridgeBootstrap` component in `+layout.svelte` handles navigation guards automatically.

<Tabs>
<TabItem label="+layout.ts">

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
      { match: '/', public: true },
      { match: new RegExp('^/auth($|/)'), public: true },
      { match: '/beta/*', featureFlag: 'beta-feature', redirectTo: '/' },
    ],
    defaultAccess: 'protected',
  };

  await bridgeBootstrap(url, config, routeConfig);
  return {};
};
```

</TabItem>
<TabItem label="+layout.svelte">

```svelte
<script lang="ts">
  import { BridgeBootstrap } from '@nebulr-group/bridge-svelte';
  let { children } = $props();
  let ready = $state(false);

  function onBootstrapComplete() {
    ready = false;
    // The tick after BridgeBootstrap resolves, render children
    ready = true;
  }
</script>

<BridgeBootstrap {onBootstrapComplete} />

{#if ready}
  {@render children()}
{/if}
```

</TabItem>
</Tabs>

**How it works:**

| Option | What it does |
|--------|--------------|
| `defaultAccess` | Sets whether unmatched routes are `'public'` or `'protected'`. |
| `rules` | Marks individual paths as public and/or gates them behind feature flags. |
| `loginRoute` | Unauthenticated users are redirected here (in-app) instead of to an external page. |

Redirects are handled automatically by `BridgeBootstrap`.
