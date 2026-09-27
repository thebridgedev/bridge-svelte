# Bridge SvelteKit — Feature Flags

You are adding **Feature Flags** to a SvelteKit application that uses The Bridge. The goal is to ship code behind a switch you control from the Bridge dashboard — no redeploy needed.

## Choose the surface first

Read this table before writing anything. Every case below is already solved by the SDK; **do not subscribe to the flag cache by hand.** If you find yourself reaching for `subscribeToFlagChanges`, `getBridgeFlagsInstance()` or a `cacheSize()` probe to work around flags "not being ready yet", you are rebuilding one of these three and will get the hydration edge cases wrong.

| What you are gating | Use | Where |
|---|---|---|
| **A whole route** — the page should not exist when the flag is off | a `routeConfig` rule: `featureFlag` + `redirectTo` | `+layout.ts`, in the `bridgeBootstrap()` call |
| **Markup** — a button, panel, menu entry inside a page | `<FeatureFlag>` | the component |
| **A value or behaviour** — which endpoint, what limit, a string/number/JSON flag | `useFlag` | the component or a `.svelte.ts` module |

Gating a route in the page component is the common mistake: the page still loads, its `load`/`onMount` still runs, and you then have to redirect *after* the flag resolves — which is where the hand-rolled hydration probes come from. The route guard runs before the route renders and has no such race.

## Gate a whole route

Route rules take a `featureFlag` and a `redirectTo`. The guard runs inside `bridgeBootstrap()` in your root `load`, on every navigation, before the route renders:

```ts
// src/routes/+layout.ts
import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';

export const ssr = false;

export const load = bridgeBootstrap({
  rules: [
    { match: '/', public: true },
    { match: '/premium/*', featureFlag: 'premium-feature', redirectTo: '/upgrade' },
    { match: '/beta/*', featureFlag: { any: ['beta-feature', 'internal'] }, redirectTo: '/' },
  ],
  defaultAccess: 'protected',
});
```

`featureFlag` accepts `'key'`, `{ any: [...] }` or `{ all: [...] }`. `match` accepts a string pattern or a `RegExp`. A rule can carry `featureFlag` **and** `public: true` together — the route needs no session, but still disappears when the flag is off.

**Adding a flag to a route that already has a rule is an edit, not a new rule.** Look for an existing entry matching that path before adding one.

### What the route guard does differently

It is a separate evaluation path from `<FeatureFlag>` / `useFlag`, and the difference is worth knowing before you pick it:

| | Route guard | `<FeatureFlag>` / `useFlag` |
|---|---|---|
| Evaluated | server-side, via the Bridge eval API, against the session | in-browser, against the local flag cache |
| Freshness | live: the current page is re-checked when a flag its rules name, the plan, entitlements or the session change | realtime push, instant |
| Context | derived from the access token (`user.*`, `tenant.*`) | local context + `bridge.attributes` + per-call `context` |
| Values | boolean gate only | any value type |

Both run the same FF 2.0 rule evaluator over the same flag records, so they agree on the verdict. They differ on *when* and on *what context they can see*: a rule targeting attributes you publish client-side with `bridge.attributes.set(...)` is invisible to the route guard.

The route guard's verdict cache is dropped whenever a flag change, plan change, entitlements change, user state change or new access token arrives, and `<BridgeBootstrap>` re-checks the page the user is currently on, so flipping a route's flag off moves the user off that page within about a second — no navigation or reload needed. Only when live updates are off (e.g. a proxy blocks WebSockets) does the guard fall back to its 5-minute cache expiry.

> Route guards ride the full Bridge bootstrap (`bridgeBootstrap` from the package root). An app running flags-only — the auth-free `/flags` subpath, no `bridgeBootstrap` — does not have them; gate with `<FeatureFlag>` instead.

## Prerequisites

Bridge is set up in this project (`bridge guide svelte`): `src/routes/+layout.ts` exports `load = bridgeBootstrap({ rules })` and `src/routes/+layout.svelte` wraps the app in `<BridgeBootstrap>`. That is all flags need: `<BridgeBootstrap>` starts them for every visitor, signed in or not. There is nothing to install, no flags bootstrap and no side-effect import. `@nebulr-group/bridge-svelte/flags` is where `useFlag` and `FeatureFlag` are imported from; it is part of the same package.

If flags never leave their default, the app id or API address is wrong — see *Troubleshooting*.

## Gate markup

```svelte
<script lang="ts">
  import { FeatureFlag } from '@nebulr-group/bridge-svelte/flags';
</script>

<FeatureFlag key="new-dashboard" defaultValue={false}>
  <NewDashboard />
  {#snippet fallback()}
    <OldDashboard />
  {/snippet}
</FeatureFlag>
```

The flag is created in Bridge, switched off, the first time it is evaluated; switch it on and the page changes without a reload. To show the developer it works, use a flag in a page they already have rather than creating a demo page.

## How `FeatureFlag` works

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `key` | `string` | yes | Flag key — auto-created in Bridge on first eval if it doesn't exist |
| `defaultValue` | `T` | yes | Value returned until the cache hydrates or if the flag doesn't exist |
| `context` | `Partial<EvalContext>` | no | Per-call eval context — see *Eval context* below |
| `children` | `Snippet<[T]>` | no | Rendered when the flag is on (`passed: true`). Receives the typed flag value |
| `fallback` | `Snippet<[T]>` | no | Rendered when the flag is off (`passed: false`). Receives the typed flag value |

Use the same `FeatureFlag` component anywhere in the app to gate any content behind a flag.

## Step 3 — Configure how the flag decides (states and rules)

A flag has exactly **three states**. `off` and `on` apply to everyone; `on-with-rule` decides per visitor.

| State | Meaning |
|---|---|
| `off` | Everyone gets the off value. A newly auto-created flag starts here |
| `on` | Everyone gets the on value |
| `on-with-rule` | The rule decides. Whoever matches a branch gets that branch's value; everyone else gets `otherwiseValue` |

A rule is **branches + otherwiseValue + rolloutPct**, first match wins:

```jsonc
{
  "branches": [
    { "conditions": [ { "attribute": "tenant.plan", "operator": "in", "values": ["pro", "enterprise"] } ],
      "returnValue": true }
  ],
  "otherwiseValue": false,
  "rolloutPct": 100          // 0-100, applies to the WHOLE rule
}
```

- Conditions inside one branch are AND-ed; add more branches for OR / different return values.
- Operators: `eq` `neq` `contains` `not_contains` `in` `not_in` `gt` `lt` `between` `regex` `exists` `not_exists` (numeric and date operators only apply to those attribute types).
- `attribute` is a dotted path into the eval context (next step). With Bridge Auth, `user.id` `user.role` `user.email` `tenant.id` `tenant.plan` are populated for you.
- **`rolloutPct` below 100 requires an identity** on the eval context — bucketing is `hash(flagKey + identity) mod 100`. With no identity the SDK refuses to bucket and returns the safe value rather than randomizing per call.

### Where to configure it

Configure it on whichever surface you have — the Bridge **MCP tools** or the **`bridge` CLI**. Same operation either way:

| | Create the flag with a rule |
|---|---|
| **MCP** | `create_feature_flag` — `key`, `valueType`, `state: "on-with-rule"`, `rule` (a structured object, not a JSON string) |
| **CLI** | `bridge flag create --key … --value-type … --state on-with-rule --rule '<json>'` |

Use whichever is already set up. **If the user asks for a specific surface, use that one** — both reach the same API. If neither is available, offer to install one; only fall back to the dashboard (**Feature Control**) if they decline.

CLI:

```bash
bridge flag create --key enterprise-export --value-type boolean --state on-with-rule \
  --rule '{"branches":[{"conditions":[{"attribute":"tenant.plan","operator":"in","values":["pro","enterprise"]}],"returnValue":true}],"otherwiseValue":false,"rolloutPct":100}'
```

MCP — `create_feature_flag`, same rule as structured arguments:

```jsonc
{
  "key": "enterprise-export",
  "valueType": "boolean",
  "state": "on-with-rule",
  "rule": {
    "branches": [
      { "conditions": [ { "attribute": "tenant.plan", "operator": "in", "values": ["pro", "enterprise"] } ],
        "returnValue": true }
    ],
    "otherwiseValue": false,
    "rolloutPct": 100
  }
}
```

### Inspect and flip

| | Read current state | Flip on/off without touching the rule |
|---|---|---|
| **MCP** | `list_feature_flags` | `toggle_feature_flag` — `key`, `enabled` |
| **CLI** | `bridge flag list` / `bridge flag get <key>` | `bridge flag toggle --key <key> --enabled true` |

Both take the **key**. Use `update_feature_flag` (MCP, which takes the `id` from `list_feature_flags`) or `bridge flag update --key <key>` only when changing the rule, values or value type.

### Dry-running a rule — CLI only

`bridge flag eval` evaluates a rule against a synthetic identity and attributes, with the app out of the way:

```bash
bridge flag eval enterprise-export --identity user-123 --attribute tenant.plan=pro   # → true
bridge flag eval enterprise-export --identity user-123 --attribute tenant.plan=free  # → false
```

**There is no MCP equivalent today.** Over MCP the nearest check is reading the stored rule back with `list_feature_flags` and confirming the branches, operators and attribute paths are what you intended — that verifies the rule was *saved* correctly, not what it *evaluates to*. When you need the actual verdict, use the CLI.

## Step 4 — Feed the rule its inputs (eval context)

Rules can only target what the app sends. Flags don't require auth — without it you supply the context yourself:

```ts
{
  identity?: string;                    // stable per-user id — required when rolloutPct < 100
  attributes: Record<string, unknown>;  // dotted or nested; whatever your rules target
}
```

Per call, on the component:

```svelte
<FeatureFlag key="enterprise-export" defaultValue={false} context={{ identity: user.id, attributes: { 'tenant.plan': plan } }}>
  {#snippet children()}<ExportButton />{/snippet}
</FeatureFlag>
```

Or publish attributes once, app-wide, on the `bridge` singleton (package root, not `/flags`):

```ts
import { bridge } from '@nebulr-group/bridge-svelte';

bridge.attributes.set('tenant.plan', plan);            // static value
bridge.attributes.bind('seats', () => currentSeats);   // live — re-read on every eval
bridge.attributes.bindMany(() => ({ region, betaOptIn }));
```

Per-call context wins on key collision. **With Bridge Auth**, the signed-in user's role and plan flow in automatically (`user.role`, `tenant.plan`) — no wiring needed; see `bridge guide svelte sdk-auth`.

## Gating logic instead of markup

`<FeatureFlag>` gates *markup*. When the flag decides **behavior or supplies a value** — which endpoint to call, a numeric limit to enforce, a `string`/`number`/JSON flag value you compute with — read it directly instead:

```svelte
<script lang="ts">
  import { useFlag } from '@nebulr-group/bridge-svelte/flags';
  const limit = useFlag('upload-limit', 5);   // reactive: limit.value, limit.passed
</script>
```

For anything this prompt doesn't cover — classic stores, non-runes contexts — read the docs at `learning/feature-flags/` (`using/in-logic.md`, `using/guard-routes.md`, `targeting/`) rather than guessing an API.

> Flags evaluate **client-side** in SvelteKit today. There is no server-side evaluation in this SDK — don't try to read a flag in `+page.server.ts` or a `+layout.server.ts` load.

## Troubleshooting

Flag not appearing in the dashboard within ~30s, or a read returns the default forever:

- **`<BridgeBootstrap>` is mounted and the app id is set.** The flag layer initializes on its mount; without it every read returns the default. Confirm `VITE_BRIDGE_APP_ID` is set — and, for a stage or local app, `VITE_BRIDGE_API_BASE_URL` too. Without it the app talks to production, where a stage app id doesn't exist; a development build warns about exactly this in the console.
- **A flag registers only once it has been evaluated** — load a page that actually reads the key.
- **Rule never matches?** Read the stored rule back — `list_feature_flags` over MCP, `bridge flag get <key>` on the CLI — and confirm the app sends exactly those attribute paths. To see the verdict without the app in the way, `bridge flag eval <key> --identity … --attribute k=v` (CLI only — no MCP equivalent).
- **`rolloutPct < 100` with no identity** returns the safe value by design.
- **Realtime.** Live toggles ride the realtime channel; if a proxy blocks WebSockets the value still resolves on next load, just not instantly. In a dev build, `<BridgeBootstrap>` shows a "Live updates off — why?" badge in the corner when the channel is refused, connected but receiving nothing, or has been retrying for over 30 s; it names the reason and whose side it is. Read the same thing in code from `realtimeStatusDetail` (`state`, `reason`, `side`, `retrying`, `docsUrl`).
- **First-render flicker is expected** — flags hydrate async. Set `defaultValue` to the safe-off state. This is a reason to gate a whole route with a `routeConfig` rule rather than in the page component, not a reason to hand-roll a readiness probe.
- **A route-guard flag toggle seems to do nothing.** A flag change arriving on the live channel drops the guard's cache and re-checks the current page within about a second, so a toggle that has no effect usually means live updates are off — check the dev badge or `realtimeStatusDetail`. Without the live channel the guard's cache expires after 5 minutes. Also confirm the rule's `match` covers the path and names the key you toggled.
- **A route-guard rule ignores attributes that work in components.** The guard evaluates server-side from the session token, so it never sees attributes you publish with `bridge.attributes.set(...)`. Target token-derived paths (`user.*`, `tenant.*`) in rules used by route guards.

## Verify

1. Open the page that reads the flag. The fallback shows, and the flag now exists, switched off: `bridge flag get <key>`.
2. Switch it on — `toggle_feature_flag` with the key over MCP, or `bridge flag toggle --key <key> --enabled true`. With neither, flip it under **Feature Control** in the Bridge dashboard.
3. The page changes **without a reload** — live updates are on by default.
4. Switch it off again; it reverts.
5. A route rule: signed in, the gated route redirects to its `redirectTo` while the flag is off.
