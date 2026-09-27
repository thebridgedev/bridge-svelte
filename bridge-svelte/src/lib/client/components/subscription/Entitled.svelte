<!--
  TBP-703 — <Entitled to="analytics">: the children render when the workspace's
  plan grants the entitlement, the `fallback` snippet when it does not.

    <Entitled to="analytics">
      <AnalyticsPanel />
      {#snippet fallback()}
        <a href="/subscription">Upgrade for analytics</a>
      {/snippet}
    </Entitled>

  Until Bridge has answered ($entitlements.ready) it renders neither — only the
  optional `loading` snippet — so a cold start never flashes the upgrade prompt
  at a paying workspace, nor the paid feature at a free one.

  The markup form of `$entitlements.can('analytics')`. Decoration only: the
  backend's @RequireEntitlement is what refuses the request.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { entitlements } from '../../../core/entitlements.js';

  interface Props {
    /** The entitlement key, e.g. `'analytics'`. */
    to: string;
    /** Rendered when the plan grants `to`. */
    children: Snippet;
    /** Rendered when Bridge has answered and the plan does not grant `to`. */
    fallback?: Snippet;
    /** Rendered until Bridge has answered. Nothing by default. */
    loading?: Snippet;
  }

  let { to, children, fallback, loading }: Props = $props();
</script>

{#if !$entitlements.ready}
  {@render loading?.()}
{:else if $entitlements.can(to)}
  {@render children()}
{:else}
  {@render fallback?.()}
{/if}
