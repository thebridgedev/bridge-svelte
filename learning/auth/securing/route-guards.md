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
      { match: '/beta/*', featureFlag: 'beta_feature', redirectTo: '/' },
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
| `loginRoute` | Unauthenticated users are redirected here (an in-app route). If you leave it unset, they go to Bridge's hosted login page instead. |

Redirects are handled automatically by `BridgeBootstrap`. For the full `RouteRule` shape, including billing gates, see the [config reference](/auth/config/#route-guard-config).

## What each guard covers

There are two guards, and they cover different moments:

| Guard | Runs | Covers |
|-------|------|--------|
| `bridgeBootstrap(url, …)` in the root `+layout.ts` | In `load`, on **every** navigation (SvelteKit re-runs the root layout load whenever the URL changes) | The first page load, client-side navigations, and redirects thrown by your own `load` functions — for example a public `/` whose `+page.ts` redirects into the app |
| `<BridgeBootstrap />` in the root `+layout.svelte` | Client-side, once the layout has mounted | Client-side navigations (a signed-out visitor is cancelled before the protected page loads), and re-checking the **current** page when a route flag, the plan, entitlements or the session change. It is **not** live during the first navigation of a page load — the load guard above covers that |

Both fail closed: if a decision cannot be reached (a network error while evaluating a flag, broken route config), a protected route is denied rather than rendered. After a plan upgrade or sign-in, route verdicts are re-evaluated straight away rather than served from cache.

### A second line of defence: `assertAuthorized`

For pages that must never render for the wrong visitor, re-check the rules in the page's own `load`. It throws the same redirect `bridgeBootstrap` would:

```ts
// src/routes/admin/+page.ts
import { assertAuthorized } from '@nebulr-group/bridge-svelte';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url }) => {
  await assertAuthorized(url);
  // ...load the page's data
};
```

:::caution[Route guards are not authorization]
Guards decide what the browser renders. Anyone can call your API directly, so every API request must still verify the user's token server-side (for example with `@nebulr-group/bridge-nestjs` or `@nebulr-group/bridge-express`).
:::

## Returning to the page they asked for

Someone who follows a link into a protected page — an emailed document link, a
bookmark, a shared URL — lands on that page after signing in, not on your
default route. This is on by default; you do not configure anything to get it.

How the target travels depends on which login you use:

| Mode | Mechanism | Your job |
|------|-----------|----------|
| **Hosted** (no `loginRoute`) | Held in `sessionStorage` across the OAuth round-trip | Nothing. It is automatic |
| **SDK** (you set `loginRoute`) | `?redirectUri=` on your own login route | Read it after login — below |

### SDK mode: read it on your login page

Your login page owns the post-login navigation, so it has to read the target.
Use `readReturnTo` — it validates the value for you:

```svelte
<script lang="ts">
  import { LoginForm, readReturnTo } from '@nebulr-group/bridge-svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  function onLogin() {
    // Falls back to your own default when there is no target, or when the
    // one supplied is not safe to navigate to.
    goto(readReturnTo($page.url) ?? '/dashboard');
  }
</script>

<LoginForm {onLogin} />
```

:::caution[Do not read the parameter yourself]
`?redirectUri=` arrives in the URL, so **whoever wrote the link controls it**.
Navigating to it unchecked is an open redirect: a link carrying
`?redirectUri=https://example.invalid` would bounce your users off-site, still
looking like it came from you. Phishing works well from there.

`readReturnTo` rejects anything that is not a same-origin path — absolute URLs,
protocol-relative `//host`, backslash variants, and control characters — and
returns `null` instead, which is why the `??` fallback above is all you need.
If you must handle the value yourself, run it through `sanitizeReturnTo` first.
:::

### Keeping auth routes out of it

Your `loginRoute` is excluded automatically, so a bounce through the login page
never comes back pointing at itself. Exclude the rest of your auth flow too:

```ts
const routeConfig: RouteGuardConfig = {
  rules: [ /* … */ ],
  defaultAccess: 'protected',
  returnTo: {
    exclude: [new RegExp('^/auth($|/)')],
  },
};
```

### Turning it off

To send every login to the same place regardless of where the visitor was
heading:

```ts
returnTo: { enabled: false }
```

Public routes are never used as a return target, and neither is a path that
fails validation — in both cases your login page gets `null` and falls back to
its own default.
