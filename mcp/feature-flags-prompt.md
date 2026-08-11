# Bridge SvelteKit — Feature Flags

You are adding **Feature Flags** to a SvelteKit application that uses The Bridge. The goal is to ship code behind a switch you control from the Bridge dashboard — no redeploy needed.

## Prerequisites check

Before starting, verify that Bridge is set up in this project:

1. `@nebulr-group/bridge-svelte` is in `package.json` dependencies
2. `src/routes/+layout.ts` calls `bridgeConfig.initConfig({ appId })`
3. `src/routes/+layout.svelte` renders `<BridgeBootstrap />`
4. `VITE_BRIDGE_APP_ID` is set in `.env`

If any are missing, run `bridge guide svelte` first.

## Step 1 — Activate the flags layer

`@nebulr-group/bridge-svelte/flags` is a subpath export — no new package to install. Importing anything from it puts the flag runtime on the dependency graph. `<BridgeBootstrap />` then initializes the flag layer on mount: local eval cache, hydration from the workspace, and realtime updates.

Add one import from `/flags` in your root layout to activate it:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import BridgeBootstrap from '@nebulr-group/bridge-svelte/client/BridgeBootstrap.svelte';
  import { FeatureFlag } from '@nebulr-group/bridge-svelte/flags';

  let { children } = $props();
</script>

<BridgeBootstrap />
<main>{@render children()}</main>
```

Flags start evaluating for all visitors as soon as `<BridgeBootstrap />` mounts — login is not required.

## Step 2 — Create the demo page

Create `src/routes/flags-demo/+page.svelte` with the content below. This page uses `FeatureFlag` to gate a visible box: grey with a striped border when the flag is off, solid green when it is on. The flag is auto-created in Bridge as off the first time the page loads.

```svelte
<!-- src/routes/flags-demo/+page.svelte -->
<script lang="ts">
  import { FeatureFlag } from '@nebulr-group/bridge-svelte/flags';
</script>

<div class="demo-page">
  <h1>Feature Flag Demo</h1>
  <p>Toggle <strong>demo-flag</strong> in the Bridge dashboard and watch this box change — no refresh needed.</p>

  <FeatureFlag key="demo-flag" defaultValue={false}>
    {#snippet children()}
      <div class="flag-box flag-on">
        <div class="flag-icon">✓</div>
        <p class="flag-label"><strong>demo-flag</strong> is <strong>enabled</strong></p>
        <p class="flag-hint">Go to Feature Control in the Bridge dashboard to toggle it off again.</p>
      </div>
    {/snippet}
    {#snippet fallback()}
      <div class="flag-box flag-off">
        <div class="flag-icon">⚑</div>
        <p class="flag-label">This box will turn green once you enable <strong>demo-flag</strong></p>
        <p class="flag-hint">Go to Feature Control in the Bridge dashboard and flip it on.</p>
      </div>
    {/snippet}
  </FeatureFlag>
</div>

<style>
  .demo-page { max-width: 480px; margin: 4rem auto; font-family: sans-serif; text-align: center; }
  .flag-box { margin: 2rem auto; padding: 2.5rem 2rem; border-radius: 10px; transition: background 0.4s ease; }
  .flag-off {
    background: linear-gradient(#f0f0f0, #f0f0f0) padding-box,
      repeating-linear-gradient(45deg, #aaa 0, #aaa 8px, transparent 8px, transparent 18px) border-box;
    border: 8px solid transparent; color: #555;
  }
  .flag-on { background: #d4edda; border: 4px solid #28a745; color: #155724; }
  .flag-icon { font-size: 2.5rem; margin-bottom: 0.75rem; }
  .flag-hint { font-size: 0.8rem; opacity: 0.65; margin-top: 0.5rem; }
</style>
```

**After creating the file, tell the user:**

> I've created a feature flag demo page at `/flags-demo`. Open it in your browser, then go to **Feature Control** in the Bridge dashboard and toggle **demo-flag** on — the box will turn green without a page refresh.

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

Configure it either in the dashboard under **Feature Control**, or from the CLI — prefer the CLI when you are an agent, since it is scriptable and verifiable:

```bash
bridge flag create --key enterprise-export --value-type boolean --state on-with-rule \
  --rule '{"branches":[{"conditions":[{"attribute":"tenant.plan","operator":"in","values":["pro","enterprise"]}],"returnValue":true}],"otherwiseValue":false,"rolloutPct":100}'

# prove the rule does what you meant, without touching the app:
bridge flag eval enterprise-export --identity user-123 --attribute tenant.plan=pro   # → true
bridge flag eval enterprise-export --identity user-123 --attribute tenant.plan=free  # → false
```

`bridge flag list` / `get <key>` inspect the current state. To flip a flag without touching its rule, `bridge flag update` addresses it **by id, not by key** — read the id first:

```bash
bridge flag get <key>                      # id is in the output
bridge flag update --id <id> --state on    # or --state off | on-with-rule
```

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
  const limit = useFlag('upload-limit', 5);   // reactive { value, passed }
</script>
```

For anything this prompt doesn't cover — classic stores, non-runes contexts, route guards — read the docs at `learning/feature-flags/` (`using/in-logic.md`, `using/guard-routes.md`, `targeting/`) rather than guessing an API.

> Flags evaluate **client-side** in SvelteKit today. There is no server-side evaluation in this SDK — don't try to read a flag in `+page.server.ts` or a `+layout.server.ts` load.

## Troubleshooting

Flag not appearing in the dashboard within ~30s, or a read returns the default forever:

- **`<BridgeBootstrap />` is mounted and `appId` is set.** The flag layer initializes on its mount; without it every read returns the default. Confirm `VITE_BRIDGE_APP_ID` is set and `initConfig({ appId })` ran in `+layout.ts`.
- **Something is imported from `/flags`.** That subpath import is what puts the flag runtime on the dependency graph.
- **A flag registers only once it has been evaluated** — load a page that actually reads the key.
- **Rule never matches?** Run `bridge flag eval <key> --identity … --attribute k=v` to see the verdict without the app in the way, then confirm the app sends those same attributes.
- **`rolloutPct < 100` with no identity** returns the safe value by design.
- **Realtime.** Live toggles ride the realtime channel; if a proxy blocks WebSockets the value still resolves on next load, just not instantly.
- **First-render flicker is expected** — flags hydrate async. Set `defaultValue` to the safe-off state.

## Verify

1. Navigate to `/flags-demo` in the browser. The grey striped box should appear — Bridge auto-creates `demo-flag` as off.
2. Go to **Feature Control** in the Bridge dashboard and toggle `demo-flag` on (or take the id from `bridge flag get demo-flag` and run `bridge flag update --id <id> --state on`).
3. The box turns green **without a page refresh** — realtime updates are on by default.
4. Toggle it off again to confirm it reverts.
