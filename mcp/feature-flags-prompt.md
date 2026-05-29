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
| `children` | `Snippet<[T]>` | no | Rendered when the flag is on (`passed: true`). Receives the typed flag value |
| `fallback` | `Snippet<[T]>` | no | Rendered when the flag is off (`passed: false`). Receives the typed flag value |

Use the same `FeatureFlag` component anywhere in the app to gate any content behind a flag.

## Verify

1. Navigate to `/flags-demo` in the browser. The grey striped box should appear — Bridge auto-creates `demo-flag` as off.
2. Go to **Feature Control** in the Bridge dashboard and toggle `demo-flag` on.
3. The box turns green **without a page refresh** — realtime updates are on by default.
4. Toggle it off again to confirm it reverts.
