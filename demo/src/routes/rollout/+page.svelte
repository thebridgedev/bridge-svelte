<script lang="ts">
  import FeatureFlag from '@bridge-svelte/lib/flags/FeatureFlag.svelte';
  import FeaturePage from '$lib/components/FeaturePage.svelte';
  import { getDoc, section } from '$lib/learning';

  // Content from the single source of truth — bridge-svelte/learning/feature-flags.
  const doc = getDoc('feature-flags');
  const rollout = section(doc, 'Percentage rollout');

  const codeTabs = [
    rollout?.code[0] && { label: 'Usage', code: rollout.code[0].code, lang: 'svelte' },
  ].filter(Boolean) as { label: string; code: string; lang: string }[];

  const related = [
    { label: 'Feature Flags', href: '/flag-demo' },
    { label: 'Paywall', href: '/paywall' },
  ];

  let key = $state('new_checkout');
</script>

<FeaturePage
  title="Percentage rollout"
  breadcrumb="Feature flags / Percentage rollout"
  oneLiner="Ramp a feature to a fraction of users with sticky buckets — the percentage lives in the flag rule."
  introHtml={rollout?.html ?? ''}
  {codeTabs}
  {related}
>
  {#snippet live()}
    <label class="ro-control">
      <span>Rollout flag key</span>
      <input bind:value={key} data-testid="rollout-key" />
    </label>

    <FeatureFlag {key} defaultValue={false}>
      {#snippet children(_v)}
        <div class="ro-result ro-result--in" data-testid="rollout-in">
          ✅ This identity is <strong>in</strong> the rollout for <code>{key}</code>
        </div>
      {/snippet}
      {#snippet fallback(_v)}
        <div class="ro-result ro-result--out" data-testid="rollout-out">
          ⬜ This identity is <strong>not</strong> in the rollout for <code>{key}</code>
        </div>
      {/snippet}
    </FeatureFlag>

    <p class="ro-hint">
      The bucket is sticky to your identity — set a percentage rule on <code>{key}</code> in
      admin and this stays consistent as you ramp it up. Switch persona (top bar) to evaluate
      as a different identity.
    </p>
  {/snippet}
</FeaturePage>

<style>
  .ro-control {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;
    font: 600 11px ui-monospace, monospace;
    color: var(--text-muted);
  }
  .ro-control input {
    padding: 7px 9px;
    border: 1px solid var(--border-2);
    border-radius: 7px;
    background: var(--surface);
    color: var(--text);
    font: 600 12.5px ui-monospace, monospace;
  }
  .ro-result {
    padding: 12px 14px;
    border-radius: 9px;
    font-size: 12.5px;
  }
  .ro-result--in {
    background: var(--live-soft);
    border: 1px solid var(--live);
    color: var(--live);
  }
  .ro-result--out {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-muted);
  }
  .ro-result code {
    font-family: ui-monospace, monospace;
  }
  .ro-hint {
    margin: 14px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--text-faint);
  }
  .ro-hint code {
    font-family: ui-monospace, monospace;
    font-size: 0.9em;
  }
</style>
