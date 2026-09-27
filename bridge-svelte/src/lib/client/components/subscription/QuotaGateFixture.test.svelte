<!-- Test fixture (TBP-703): <QuotaGate> with a button and, optionally, a custom atLimit snippet. -->
<script lang="ts">
  import QuotaGate from './QuotaGate.svelte';

  interface Props {
    metric?: string;
    custom?: boolean;
  }
  const { metric = 'tickets', custom = false }: Props = $props();
</script>

{#if custom}
  <QuotaGate {metric}>
    <button type="button" data-testid="action">New ticket</button>
    {#snippet atLimit(quota)}
      <span data-testid="custom-limit">{quota.used}/{quota.limit} used — talk to sales</span>
    {/snippet}
  </QuotaGate>
{:else}
  <QuotaGate {metric}>
    <button type="button" data-testid="action">New ticket</button>
  </QuotaGate>
{/if}
