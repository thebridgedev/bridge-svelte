<!-- Test fixture (TBP-703): <Entitled> with children, a fallback and (optionally) a loading snippet. -->
<script lang="ts">
  import Entitled from './Entitled.svelte';

  interface Props {
    to?: string;
    withLoading?: boolean;
  }
  const { to = 'analytics', withLoading = false }: Props = $props();
</script>

{#if withLoading}
  <Entitled {to}>
    <span data-testid="feature">Analytics</span>
    {#snippet fallback()}<span data-testid="fallback">Upgrade for analytics</span>{/snippet}
    {#snippet loading()}<span data-testid="checking">Checking your plan…</span>{/snippet}
  </Entitled>
{:else}
  <Entitled {to}>
    <span data-testid="feature">Analytics</span>
    {#snippet fallback()}<span data-testid="fallback">Upgrade for analytics</span>{/snippet}
  </Entitled>
{/if}
