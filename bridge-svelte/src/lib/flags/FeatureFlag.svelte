<!--
  bridge-svelte/flags — declarative component for Bridge feature flags.

  Two snippets:
    - `children` — rendered when Bridge's rule passed (flag is on for this user)
    - `fallback` — rendered when the flag is off or no rule matched

  Both snippets receive the Bridge-decided value so you can use it directly.

  Usage:
    <FeatureFlag key="new-dashboard" defaultValue={false}>
      {#snippet children()}<NewDashboard />{/snippet}
    </FeatureFlag>

    <FeatureFlag key="ui-theme" defaultValue="light-mode">
      {#snippet children(value)}<App theme={value} />{/snippet}
      {#snippet fallback(value)}<App theme={value} />{/snippet}
    </FeatureFlag>
-->
<script lang="ts" generics="T = boolean">
  import type { Snippet } from 'svelte';
  import type { EvalContext } from '@nebulr-group/bridge-auth-core';
  import { evaluateFlag } from './registry.js';
  import { _flagVersionsRune } from './flag.svelte.js';

  let {
    key,
    defaultValue,
    context,
    children,
    fallback,
  }: {
    key: string;
    defaultValue: T;
    /**
     * Optional per-call EvalContext. Use when a flag's rule targets
     * dev-supplied attributes (e.g. `{ attributes: { plan } }`). Per-call
     * attributes win on key collision over Bridge-managed providers.
     */
    context?: Partial<EvalContext>;
    children?: Snippet<[T]>;
    fallback?: Snippet<[T]>;
  } = $props();

  const result = $derived.by(() => {
    // Reactive dependency: read the per-key version so the derived re-runs
    // whenever this flag changes in the cache.
    _flagVersionsRune().get(key);
    return evaluateFlag<T>(key, defaultValue, context);
  });
</script>

{#if result.passed}
  {#if children}{@render children(result.value)}{/if}
{:else if fallback}
  {@render fallback(result.value)}
{/if}
