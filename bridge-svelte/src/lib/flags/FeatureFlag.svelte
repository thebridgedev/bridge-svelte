<!--
  bridge-svelte/flags — declarative component for Bridge feature flags.

  Two snippets:
    - `children` — rendered when Bridge's rule passed (flag is on for this user)
    - `fallback` — rendered when the flag is off or no rule matched

  Both snippets receive the Bridge-decided value so you can use it directly.
  TBP-756 — `fallback` also receives why the feature is off, and a way to open
  the upgrade dialog:
    - `reason`: 'plan' (an upgrade alone would turn it on), 'permission' (this
      person's role or privileges), 'off', 'rule', 'rollout', or undefined when
      Bridge has not said (the flag is not loaded yet)
    - `feature`: with 'plan', the plan feature the rule asks for
    - `openUpgrade()`: opens the upgrade dialog for this feature. Call it from a
      click; rendering a fallback never opens anything by itself.

  `upgrade` (opt-in): with no `fallback`, a feature that is off because of the
  plan renders a small "Upgrade to use this" prompt in its place; clicking it
  opens the upgrade dialog. Off for any other reason: nothing, as before.

  Usage:
    <FeatureFlag key="new-dashboard" defaultValue={false}>
      {#snippet children()}<NewDashboard />{/snippet}
    </FeatureFlag>

    <FeatureFlag key="reports" defaultValue={false}>
      {#snippet children()}<Reports />{/snippet}
      {#snippet fallback(_value, { reason, openUpgrade })}
        {#if reason === 'plan'}<button onclick={openUpgrade}>Upgrade for reports</button>{/if}
      {/snippet}
    </FeatureFlag>

    <FeatureFlag key="reports" defaultValue={false} upgrade>
      {#snippet children()}<Reports />{/snippet}
    </FeatureFlag>
-->
<script lang="ts" module>
  /** TBP-756 — what a `<FeatureFlag>` fallback learns about why the feature is off. */
  export interface FeatureFlagOffInfo {
    reason: 'plan' | 'permission' | 'off' | 'rule' | 'rollout' | undefined;
    feature: string | undefined;
    openUpgrade: () => void;
  }
</script>

<script lang="ts" generics="T = boolean">
  import type { Snippet } from 'svelte';
  import type { EvalContext } from '@nebulr-group/bridge-auth-core';
  import { evaluateFlag } from './registry.js';
  import { _flagVersionsRune } from './flag.svelte.js';
  import { openFeatureUpgrade } from '../core/feature-upgrade.js';

  let {
    key,
    defaultValue,
    context,
    upgrade = false,
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
    /**
     * TBP-756 — opt in to an inline "Upgrade to use this" prompt when the
     * feature is off because of the plan and there is no `fallback`.
     */
    upgrade?: boolean;
    children?: Snippet<[T]>;
    fallback?: Snippet<[T, FeatureFlagOffInfo]>;
  } = $props();

  const result = $derived.by(() => {
    // Reactive dependency: read the per-key version so the derived re-runs
    // whenever this flag changes in the cache.
    _flagVersionsRune().get(key);
    return evaluateFlag<T>(key, defaultValue, context);
  });

  // An auth-core without TBP-756 returns no reason; the info is then empty.
  const off = $derived.by((): FeatureFlagOffInfo => {
    const r = result as { reason?: FeatureFlagOffInfo['reason']; feature?: string };
    return {
      reason: r.reason,
      feature: r.feature,
      openUpgrade: () => openFeatureUpgrade({ flag: key, feature: r.feature ?? null }),
    };
  });
</script>

{#if result.passed}
  {#if children}{@render children(result.value)}{/if}
{:else if fallback}
  {@render fallback(result.value, off)}
{:else if upgrade && off.reason === 'plan'}
  <button
    type="button"
    class="bridge-btn bridge-btn-secondary bridge-feature-upgrade"
    data-bridge-feature-upgrade={key}
    onclick={off.openUpgrade}
  >
    Upgrade to use this
  </button>
{/if}
