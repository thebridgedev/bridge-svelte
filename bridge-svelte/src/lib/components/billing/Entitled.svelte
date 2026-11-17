<!--
  <Entitled to="analytics">: the children render when the plan has the feature,
  the `fallback` snippet when it does not.

    <Entitled to="analytics">
      <AnalyticsPanel />
      {#snippet fallback()}
        <a href="/subscription">Upgrade for analytics</a>
      {/snippet}
    </Entitled>

  Until Bridge has answered (`$entitlements.ready`) it renders neither, only the
  optional `loading` snippet, so a cold start never flashes the upgrade prompt
  at a paying workspace, nor the paid feature at a free one.

  It reads the flag `bridge:billing.entitlement.<to>`, as
  `$entitlements.can('analytics')` does. To show something for a flag in
  general, with its reason, use `<FeatureFlag key>`.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { entitlements } from '../../core/entitlements.js';

  interface Props {
    /** The plan feature's key, such as `analytics`. */
    to: string;
    /** Rendered when the plan has `to`. */
    children: Snippet;
    /** Rendered when Bridge has answered and the plan does not have `to`. */
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
