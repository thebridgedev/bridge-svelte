<!-- Test-only harness for feature-upgrade.test.ts (TBP-756): renders a
     <FeatureFlag> whose fallback prints the off info, or calls openUpgrade
     while rendering (standing in for a click, which svelte/server cannot do). -->
<script lang="ts">
  import FeatureFlag from '../flags/FeatureFlag.svelte';

  let { mode }: { mode: 'fallback' | 'click' } = $props();
</script>

<FeatureFlag key="reports" defaultValue={false}>
  {#snippet fallback(_value, info)}
    {#if mode === 'click'}
      {info.openUpgrade()}
    {:else}
      <span>reason={info.reason} feature={info.feature}</span>
    {/if}
  {/snippet}
</FeatureFlag>
