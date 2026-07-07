# Get started

Bridge bootstraps flags automatically when the flags module is on your dependency graph:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { BridgeBootstrap } from '@nebulr-group/bridge-svelte';
  // Keep the flags module on the static dependency graph —
  // <BridgeBootstrap /> auto-attaches it (rule cache, live updates, telemetry).
  import '@nebulr-group/bridge-svelte/flags';

  let { children } = $props();
</script>

<BridgeBootstrap />
{@render children()}
```

No flag-specific init call is needed — configuration comes from the same `bridgeBootstrap(url, config, routeConfig)` you already call in `+layout.ts` (only `appId` is required for flags-only apps).
