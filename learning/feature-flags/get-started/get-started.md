# Get started

Flags come with the SDK you already have: as long as your app imports the flags
module somewhere, `<BridgeBootstrap />` wires everything up for you (the rule
cache, live updates, and telemetry). There is no separate flags client to
create and no flag-specific init call.

## 1. Set up the SDK

Add the import to your root layout so the flags module is always loaded:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { BridgeBootstrap } from '@nebulr-group/bridge-svelte';
  // This import is what activates flags: <BridgeBootstrap /> detects the
  // module and attaches the rule cache, live updates, and telemetry.
  import '@nebulr-group/bridge-svelte/flags';

  let { children } = $props();
</script>

<BridgeBootstrap />
{@render children()}
```

Configuration comes from the same `bridgeBootstrap(url, config, routeConfig)`
call you already make in `+layout.ts`. Only `appId` is required for flags-only
apps.

## 2. Create a flag in Control Center

In Control Center (your admin dashboard at app.thebridge.dev), open Feature
Flags and create a boolean flag, for example `show_banner`, and leave it off.

## 3. Read the flag in a component

```svelte
<script lang="ts">
  import { useFlag } from '@nebulr-group/bridge-svelte/flags';

  const banner = useFlag('show_banner', false);
</script>

{#if banner.value}
  <div class="banner">New stuff!</div>
{/if}
```

The second argument is the default: the value your app uses when the flag
isn't configured or Bridge is unreachable, so a flag check can never break
your app.

## 4. Flip it and watch it change live

With your app open in the browser, go back to Control Center and turn
`show_banner` on. The banner appears without a refresh, typically within
seconds: rule changes arrive over the live channel (a persistent realtime
connection the SDK maintains) and reactive reads like `useFlag` update in
place. Flip it off again and the banner disappears the same way.

That's the whole loop: create a flag, read it in code with a safe default,
and control it from Control Center from then on.

## Next steps

- [Show or hide UI](/feature-flags/using/show-hide-ui/) with the declarative `<FeatureFlag>` component
- [Use flags in your logic](/feature-flags/using/in-logic/) for branching code paths, not just markup
- [Guard routes](/feature-flags/using/guard-routes/) to gate whole pages behind a flag
- [Use flags on your backend](/feature-flags/using/backend/) so server and browser agree
