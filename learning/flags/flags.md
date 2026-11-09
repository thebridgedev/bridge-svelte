# Flags and route guards

Every gate in your app is a flag: a page, a link, a button. The flag's rule, set in Bridge, says why it is on for someone: a privilege, a plan feature, a rollout. Your code reads the flag, never a role, a privilege list or the plan. Change who sees what in Bridge, without a deploy.

A flag Bridge has no result for is off (or gives the fallback you pass), so gates fail closed.

## Guarding routes

```ts
// src/routes/+layout.ts
export const load = bridgeBootstrap({
  rules: [
    { match: '/', public: true },
    { match: '/docs/*', public: true },
    { match: '/reports', featureFlag: 'reports', redirectTo: '/' },
    { match: /^\/admin(\/|$)/, featureFlag: { all: ['admin-area', 'reports'] } },
  ],
});
```

- The first rule whose `match` fits the path decides. `match` is an exact path, a path with `*`, or a RegExp.
- `public: true` opens a route to visitors. Routes no rule matches need a signed-in person, unless `defaultAccess: 'public'`.
- `featureFlag` names one flag, `{ any: [...] }` or `{ all: [...] }`. While it is off, the person goes to `redirectTo` (default: your home page after sign-in).
- The guard runs again when the session or the flags change, so a flag turned off in Bridge closes an open page within a second.

For one page, in its own load function:

```ts
import { requireFlag } from '@nebulr-group/bridge-svelte';

export const load = async ({ parent }) => {
  await parent();
  await requireFlag('reports', { redirectTo: '/' });
};
```

## Showing and hiding

```svelte
<script lang="ts">
  import { FeatureFlag } from '@nebulr-group/bridge-svelte';
</script>

<FeatureFlag key="reports">
  <a href="/reports">Reports</a>
</FeatureFlag>
```

When a feature is off because the workspace's plan lacks it, `<FeatureFlag upgrade>` shows a small upgrade prompt in its place, which opens the upgrade dialog. For your own wording, use `fallback`:

```svelte
<FeatureFlag key="reports">
  <Reports />
  {#snippet fallback(_value, { reason, entitlement, openUpgrade })}
    {#if reason === 'plan'}<button onclick={openUpgrade}>Upgrade for reports</button>{/if}
  {/snippet}
</FeatureFlag>
```

## In your code

```ts
import { useFlag, flag } from '@nebulr-group/bridge-svelte';

const reports = useFlag('reports');          // reports.value, reports.reason
const theme = flag('theme', 'light');        // a store: $theme
```

`flags` is the store of every result, and `flagsStatus` says whether they have loaded.

## The standard flags

Bridge keeps three flags for every app, and the plugin's own screens gate on them. Their rules are yours to change in Bridge.

| Flag | On means | Used by |
|---|---|---|
| `bridge-billing-manage` | may choose a plan and open the billing portal | the plan picker, the portal button, the upgrade dialog |
| `bridge-team-manage` | may invite, change roles and remove members | the team panel |
| `bridge-app-active` | the app is active for this workspace | the paywall: while it is off, signed-in people go to the plan page |

To gate them on your own flags instead:

```ts
bridgeBootstrap({ flags: { billingManage: 'can-pay', teamManage: 'can-admin', appActive: 'subscribed' } });
```

`canManageBilling()` and `canManageTeam()` give the first two as stores, for your own screens.

## Hints

A rule may read values your page knows, such as a country. Pass them as hints:

```ts
bridgeBootstrap({ hints: { country: 'SE' } });
```

Who the person is always comes from their token, never from a hint.
