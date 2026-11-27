# Bridge SvelteKit — Feature Flags (bridge-svelte 1.0)

You are adding **feature flags** to a SvelteKit app that uses `@nebulr-group/bridge-svelte` 1.0. The goal: a page, a link, a button or a value is controlled by a switch in Bridge, changed without a redeploy. If Bridge is not set up in the project yet, do `bridge guide svelte` (MCP: `get_integration_guide topic=integration framework=svelte`) first; flags need nothing beyond that setup.

## The one rule for app code

**Every gate in app code is a flag.** A link, a page, a button, an endpoint: if some people get it and others do not, the code asks a flag, and the flag's rule says why: a privilege (`privileges contains users:write`), a plan feature (`bridge:billing.entitlement.analytics eq true`) or a rollout. App code never reads a role, a privilege list, the plan or a plan feature to decide what someone may see or do.

Two things are not gates and are not flags: **numbers** are plan limits (`<QuotaGate>` and `useQuota` in the browser, `meter()` on the server: `bridge guide svelte billing`), and **permission on one specific record** stays in app code ("only the author edits their post").

The browser shows or hides with the surfaces below; the server enforces the same flag on every call with `requireFlag` from `@nebulr-group/bridge-svelte/server` (or `@RequireFlag` in a NestJS backend). A flag Bridge has no result for is off (or gives the fallback you pass), so gates fail closed.

Before calling the work done, run `npx @nebulr-group/bridge-cli@alpha check gates` in the project and fix what it lists.

## Choose the surface first

Every case is already solved by the plugin. Do not subscribe to the flag results by hand or probe whether they have loaded.

| What you are gating | Use | Where |
|---|---|---|
| **A whole route**: the page must not open while the flag is off | a route rule `{ match, featureFlag, redirectTo }` | `src/routes/+layout.ts`, in `bridgeBootstrap({ rules })` |
| **One page's load** | `requireFlag(key, { redirectTo })` | that page's `+page.ts` |
| **Markup**: a button, a panel, a nav link | `<FeatureFlag key>` | the component |
| **A value or behaviour**: a string, number or JSON flag, or a boolean in script | `useFlag(key, fallback)` (runes) or `flag(key, fallback)` (a store) | the component or a `.svelte.ts` module |
| **An endpoint** | `requireFlag(event, key)` from `@nebulr-group/bridge-svelte/server` | `+server.ts` |

Gating a route inside the page component is the common mistake: the page still loads and then has to leave. The route rule runs before the route renders.

## Gate a whole route

```ts
// src/routes/+layout.ts
import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';

export const ssr = false;

export const load = bridgeBootstrap({
  rules: [
    { match: '/', public: true },
    { match: '/reports', featureFlag: 'reports', redirectTo: '/' },
    { match: /^\/admin(\/|$)/, featureFlag: { all: ['admin-area', 'reports'] } },
  ],
});
```

- The first rule whose `match` fits decides. `match` is an exact path, a path with `*`, or a `RegExp`.
- `featureFlag` takes `'key'`, `{ any: [...] }` or `{ all: [...] }`. While it is off, the person goes to `redirectTo` (default: `auth.afterSignIn` when signed in, else sign-in).
- A rule may carry `public: true` and `featureFlag` together: no session needed, and the page still closes while the flag is off. A flag a signed-out visitor reads must be public (`bridge flag update <key> --public`).
- The guard runs again when the session or the flags change, so a flag turned off in Bridge closes an open page within about a second.
- Adding a flag to a path that already has a rule is an edit of that rule, not a new one.

For one page, in its own load:

```ts
// src/routes/reports/+page.ts
import { requireFlag } from '@nebulr-group/bridge-svelte';

export const load = async ({ parent }) => {
  await parent();
  await requireFlag('reports', { redirectTo: '/' });
};
```

## Gate markup

```svelte
<script lang="ts">
  import { FeatureFlag } from '@nebulr-group/bridge-svelte';
</script>

<FeatureFlag key="reports">
  <a href="/reports">Reports</a>
</FeatureFlag>
```

| Prop | Type | What it does |
|---|---|---|
| `key` | `string` | The flag key |
| `defaultValue` | `T` | The value while there is no result |
| `children` | `Snippet<[T]>` | Rendered while the flag is on; receives the value |
| `fallback` | `Snippet<[T, { reason, entitlement, why, openUpgrade }]>` | Rendered while it is off. `reason` is `'plan'` when the workspace's plan lacks the feature the rule names, `'off'` otherwise, `undefined` while loading; `openUpgrade()` opens the upgrade dialog |
| `upgrade` | `boolean` | With no `fallback`: when the plan is the reason, a small upgrade prompt in its place |
| `messages` | `BridgeMessages` | Wording of the upgrade prompt |

```svelte
<FeatureFlag key="reports">
  <Reports />
  {#snippet fallback(_value, { reason, openUpgrade })}
    {#if reason === 'plan'}<button onclick={openUpgrade}>Upgrade for reports</button>{/if}
  {/snippet}
</FeatureFlag>
```

## Values and behaviour in script

```ts
import { useFlag, flag } from '@nebulr-group/bridge-svelte';

const reports = useFlag('reports');          // reports.value, reports.reason (runes)
const theme = flag('theme', 'light');        // a store: $theme
```

`flags` is the store of every result and `flagsStatus` says whether they have loaded (for a loading state only, never to work around a gate). Values a rule may read that the page knows, such as a country, go in `bridgeBootstrap({ hints: { country: 'SE' } })`; who the person is always comes from their token, never from a hint.

## On your server

```ts
// src/hooks.server.ts
import { env as publicEnv } from '$env/dynamic/public';
import { bridgeHandle } from '@nebulr-group/bridge-svelte/server';

export const handle = bridgeHandle({ issuer: publicEnv.PUBLIC_BRIDGE_ISSUER });
```

```ts
// src/routes/api/reports/+server.ts
import { json } from '@sveltejs/kit';
import { requireFlag } from '@nebulr-group/bridge-svelte/server';

export const GET = async (event) => {
  const actor = await requireFlag(event, 'reports'); // 401 without a caller, 403 while the flag is off for them
  return json({ workspace: actor.workspaceId });
};
```

`flagsFor(event)` gives every result for the caller. Add `event.locals.bridge` to `App.Locals` (`import type { BridgeLocals } from '@nebulr-group/bridge-svelte/server'`). The browser calls the endpoint with `bridgeFetch`, which carries the token. A NestJS backend uses `@RequireFlag` from `@nebulr-group/bridge-nestjs@alpha` instead (`bridge guide nestjs feature-flags`).

## The standard flags

Bridge keeps three flags for every app, and the plugin's own screens gate on them. Their rules are the developer's to change.

| Flag | On means | Default rule |
|---|---|---|
| `bridge-billing-manage` | may choose a plan and open the billing portal | `bridge:privileges contains billing:manage` |
| `bridge-team-manage` | may invite, change roles and remove members | `bridge:privileges contains users:write` |
| `bridge-app-active` | the workspace may use the app; off sends signed-in people to the plan page | `bridge:billing.entitlement.app_active eq true` |

`bridgeBootstrap({ flags: { billingManage, teamManage, appActive } })` names other flags instead. `canManageBilling()` and `canManageTeam()` give the first two as stores, for your own screens.

## Create the flag and its rule

Who should get the feature (everyone, a share, a plan, a privilege, named people) is the developer's decision: ask, then create the flag. Create it before the code reads it.

| | MCP | CLI 1.0 |
|---|---|---|
| Create, with a rule | `create_feature_flag` (`key`, `valueType`, `state: "on-with-rule"`, `rule`) | `bridge flag create <key> --when "<attribute> <operator> <value>"` |
| Read | `get_flag`, `list_feature_flags` | `bridge flag get <key>`, `bridge flag list` |
| Change the rule | `update_feature_flag` | `bridge flag rule add <key> --when "…"`, `bridge flag rule set <key> --rule-file rule.json`, `bridge flag rule clear <key>` |
| On, off, back | `toggle_feature_flag` | `bridge flag on <key>`, `bridge flag off <key>` (the kill switch, keeps the rule), `bridge flag restore <key>` |
| Dry-run who gets it | `evaluate_feature_flag` | `bridge flag eval <key> --context '{"bridge:billing.entitlement.analytics":true}'` |
| Later, at a time | `set_flag_schedule` | `bridge flag schedule set <key> --at <time> --state on` |

A flag has three states: `off` (everyone gets the off value), `on` (everyone gets the on value) and `on-with-rule` (the rule decides). A rule is ordered branches of AND-ed conditions; the first match wins and everyone else gets the off value. `--when` builds a one-branch rule; repeat it to AND conditions, add `--rollout <percent>` for a share. A share under 100 needs an identity, which a signed-in person has.

The facts a rule may read, from the token and Billing:

| Attribute | Means |
|---|---|
| `privileges` (`bridge:privileges`) | the person's privileges; use `contains`, e.g. `privileges contains users:write` |
| `bridge:billing.entitlement.<feature>` | the workspace's plan includes the feature: `eq true` |
| `user.email` (`bridge:email`), `user.id` (`bridge:user`) | named people |
| `tenant.id` (`bridge:workspace`) | named workspaces |
| your hints | values the page passes in `hints` |

- **A feature a plan sells**: list it on the plan (`bridge plan feature add <plan> <feature>`, MCP `add_plan_feature`) and rule the flag `bridge:billing.entitlement.<feature> eq true`. The rule never names a plan, so changing what a plan sells is one edit on the plan.
- **Who someone is**: a privilege rule (`privileges contains reports:read`). Read the app's real roles and privileges first (`bridge role list`, `bridge privilege list`; MCP `list_roles`). A role rule is for when the developer means the role itself.

## Troubleshooting

- The flag never turns on: `bridge flag get <key>` shows its state and rule; `bridge flag eval <key> --context '…'` with the person's facts shows what the rule gives.
- On for some and not others: the rule reads something the person lacks; check their privileges (`bridge member get <member>`) or the plan's features (`bridge plan get <plan>`).
- A signed-out visitor never sees it: the flag is not public (`bridge flag update <key> --public`).

## Verify

Run the terminal checks. If you have a browser tool, run the browser checks too. If you do not, list them for the developer, numbered, and start the summary with a Heads up line saying which checks were not run.

### Terminal checks

1. The build passes.
2. `npx @nebulr-group/bridge-cli@alpha check gates` lists nothing.
3. `bridge flag get <key>` shows the state and the rule the developer chose; a plan-feature rule names `bridge:billing.entitlement.<feature>`, never a plan.
4. `bridge flag eval <key> --context '…'` gives the on value for someone the rule should match and the off value for someone it should not.
5. With an endpoint gated on the server, calling it without a token answers 401.

### Browser checks

1. Signed in as someone the rule matches, the gated page, link or button shows.
2. `bridge flag off <key>`: within about a second the gated markup hides and an open gated page closes, without a reload. `bridge flag restore <key>` brings it back.
3. Signed in as someone the rule does not match, the page redirects to `redirectTo` and the markup stays hidden.

Never call the browser checks done when you did not run them. When any was not run, the summary starts with "Heads up: not verified in a browser" and lists them for the developer, numbered.
