<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { isFeatureEnabled } from '../../shared/feature-flag.js';

  type FlagRenderArgs = { enabled: boolean; rawEnabled: boolean };

  let {
    flagName,
    forceLive = false,
    negate = false,
    renderWhenDisabled = false,
    children
  }: {
    flagName: string;
    forceLive?: boolean;
    negate?: boolean;
    renderWhenDisabled?: boolean;
    children?: Snippet<[FlagRenderArgs]>;
  } = $props();

  let enabled = $state(false);
  let rawEnabled = $derived(enabled);
  let effectiveEnabled = $derived(negate ? !enabled : enabled);

  onMount(async () => {
    enabled = await isFeatureEnabled(flagName, forceLive);
  });
</script>

{#if children}
  {#if renderWhenDisabled}
    {@render children({ enabled: effectiveEnabled, rawEnabled })}
  {:else if effectiveEnabled}
    {@render children({ enabled: true, rawEnabled })}
  {/if}
{/if}
