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

## Beyond the component — the rest of `/flags`

`FeatureFlag` covers most UI gating, but the same subpath exports three other ways to read a flag. Pick by where you are:

```ts
import { useFlag, flagStore, evaluateFlag, realtimeStatus } from '@nebulr-group/bridge-svelte/flags';
```

**`useFlag(key, defaultValue, context?)` — inside components and `.svelte.ts` modules.** Runes-based and reactive; re-evaluates when the flag changes. Every argument also accepts a getter function, so a reactive key or context stays live:

```svelte
<script lang="ts">
  import { useFlag } from '@nebulr-group/bridge-svelte/flags';

  const newCheckout = useFlag('new-checkout', false);
  // reactive form — re-evaluates when `plan` changes:
  const limit = useFlag('upload-limit', 5, () => ({ attributes: { plan } }));
</script>

{#if newCheckout.passed}<NewCheckout />{/if}
<p>Upload limit: {limit.value}</p>
```

**`flagStore(key, defaultValue, context?)` — classic Svelte store.** Same evaluation, `$`-prefix usable, for code that isn't runes-based:

```svelte
<script lang="ts">
  import { flagStore } from '@nebulr-group/bridge-svelte/flags';
  const banner = flagStore('promo-banner', false);
</script>

{#if $banner.passed}<PromoBanner />{/if}
```

**`evaluateFlag(key, defaultValue, context?)` — plain function, no runes.** Safe in SSR, `+page.ts` loads, tests, and plain `.ts` modules. Returns `{ passed, value }` once, with no reactivity — it returns the default when the flag runtime isn't initialized (e.g. during SSR before hydration), so treat it as a point-in-time read.

**`realtimeStatus`** is a store exposing the live channel's `ConnectionState` — useful for a "live / reconnecting" indicator in dev tooling.

## Eval context — identity and attributes

Flags don't require auth. But if a flag's rule targets *who* is asking, pass an eval context. It has two fields:

```ts
{
  identity?: string;                    // stable per-user id — required for % rollouts
  attributes: Record<string, unknown>;  // flat or nested; whatever your rules target
}
```

Pass it per call on any of the four read paths:

```svelte
<FeatureFlag key="enterprise-feature" defaultValue={false} context={{ identity: user.id, attributes: { plan } }}>
  {#snippet children()}<Enterprise />{/snippet}
</FeatureFlag>
```

> **Percentage rollouts need `identity`.** If a rule rolls out to a percentage and the context carries no identity, the SDK refuses to bucket and returns the safe default — it never randomizes per call, so a user can't flip between variants on re-render.

For attributes you'd otherwise thread through every call, publish them once on the `bridge` singleton (imported from the package root, not `/flags`):

```ts
import { bridge } from '@nebulr-group/bridge-svelte';

bridge.attributes.set('plan', 'pro');                        // static one-shot value
bridge.attributes.bind('seats', () => currentSeats);         // live — read on every eval
bridge.attributes.bindMany(() => ({ region, betaOptIn }));   // bulk, same liveness
```

Per-call context wins on key collision over these app-wide attributes.

## Flag states — what you configure in the dashboard

A flag in Bridge 2.0 has exactly **three states**:

| State | Meaning |
|---|---|
| `off` | Everyone gets the off branch. This is what a newly auto-created flag starts as |
| `on` | Everyone gets the on branch |
| `on-with-rule` | On for whoever matches the rule (attribute conditions and/or a percentage rollout); off for everyone else |

> **Naming collision, worth knowing.** The `defaultValue` prop in these snippets is a **client-side** fallback — what the SDK returns while the eval cache is still hydrating or if the key doesn't exist. It is unrelated to the retired server-side `enabled / targetValue / defaultValue / segments` fields from Bridge 1.x, which the three states above replaced. If you're migrating from 1.x, there is no `targetValue` anymore: an `on-with-rule` flag carries its value on the rule's branch.

## Standalone vs full-platform

- **Standalone flags** — Bridge Auth not in use: pass your own `{ identity, attributes }` as shown above. Everything on this page works with no signed-in user.
- **With Bridge Auth** — the signed-in user's `role` and `plan` merge into the eval context automatically via the auth attribute provider, so rules can target them with no extra wiring. See the auth guide (`bridge guide svelte sdk-auth`).

## Troubleshooting

Flag not appearing in the dashboard within ~30s, or a read returns the default forever:

- **`<BridgeBootstrap />` is mounted and `appId` is set.** The flag layer initializes on its mount; without it, every read returns the default. Confirm `VITE_BRIDGE_APP_ID` is set and `initConfig({ appId })` ran in `+layout.ts`.
- **Something is imported from `/flags`.** The subpath import is what puts the flag runtime on the dependency graph — a project that never imports from it has no flag layer to initialize.
- **A flag registers only once it has been evaluated.** Auto-creation happens on first eval for a real workspace, so load a page that actually reads the key.
- **Runes vs non-runes.** `useFlag` and `flagStore` need a component or `.svelte.ts` module. In SSR, a `+page.ts` load, or a plain `.ts` file, use `evaluateFlag` instead — the runes helpers won't track there.
- **Realtime / live channel.** Live toggles ride the realtime channel; if a proxy blocks WebSockets the value still resolves on the next load, just not instantly. Check `realtimeStatus` to confirm the channel is connected.
- **First-render flicker is expected** — flags hydrate async. Set `defaultValue` to the safe-off state, or render a skeleton until the value settles.

## Verify

1. Navigate to `/flags-demo` in the browser. The grey striped box should appear — Bridge auto-creates `demo-flag` as off.
2. Go to **Feature Control** in the Bridge dashboard and toggle `demo-flag` on.
3. The box turns green **without a page refresh** — realtime updates are on by default.
4. Toggle it off again to confirm it reverts.
