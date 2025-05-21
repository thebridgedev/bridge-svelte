<script lang="ts">
  import { isFeatureEnabled } from '../../shared/feature-flag';
  import { onMount } from 'svelte';

  let { flagName, forceLive = false, negate = false } = $props();

  let enabled = $state(false);

  let shouldRender = $derived(() => negate ? !enabled : enabled);

  onMount(async () => {
    enabled = await isFeatureEnabled(flagName, forceLive);
  });
</script>

{#if shouldRender}
  <slot {enabled} />
{/if}
