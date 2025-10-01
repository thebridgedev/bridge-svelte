<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { isFeatureEnabled } from '../../shared/feature-flag.js';

  let { flagName, forceLive = false, negate = false, children }: { flagName: string; forceLive?: boolean; negate?: boolean; children?: Snippet } = $props();

  let enabled = $state(false);

  let shouldRender = $derived(() => negate ? !enabled : enabled);

  onMount(async () => {
    enabled = await isFeatureEnabled(flagName, forceLive);
  });
</script>

{#if shouldRender}
  {#if children}
    {@render children()}
  {/if}
{/if}
