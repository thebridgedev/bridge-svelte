<script lang="ts">
  import QuotaGate from './QuotaGate.svelte';

  let { metric, custom = false }: { metric: string; custom?: boolean } = $props();
</script>

{#if custom}
  <QuotaGate {metric}>
    <button id="go">Go</button>
    {#snippet atLimit(quota)}<em id="mine">{quota.used} of {quota.limit} used</em>{/snippet}
  </QuotaGate>
{:else}
  <QuotaGate {metric}>
    <button id="go">Go</button>
  </QuotaGate>
{/if}
