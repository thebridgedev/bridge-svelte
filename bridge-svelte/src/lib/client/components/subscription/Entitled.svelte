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

  The markup form of `$entitlements.can('analytics')`. It reads the plan
  directly, which is the exception: the standard gate is `<FeatureFlag key>`
  with a flag ruled `bridge:billing.entitlement.<key> eq true`. In development
  it logs a one-time note saying so (TBP-705).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { entitlements } from '../../../core/entitlements.js';
  import { noteDirectPlanCheck } from '../../../core/direct-plan-check-note.js';

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

  // Runs before the first render, so this note — not the store's `can()` one —
  // is the one a page using <Entitled> sees. Once per page load, so the first
  // `to` is the one it names.
  const note = () => noteDirectPlanCheck('entitled', to);
  note();
</script>

{#if !$entitlements.ready}
  {@render loading?.()}
{:else if $entitlements.can(to)}
  {@render children()}
{:else}
  {@render fallback?.()}
{/if}
