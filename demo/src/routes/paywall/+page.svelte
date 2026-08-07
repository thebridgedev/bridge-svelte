<script lang="ts">
  import BridgeSubscriptionStatus from '@bridge-svelte/lib/client/components/subscription/BridgeSubscriptionStatus.svelte';
  import { bridge } from '@bridge-svelte/lib/core/bridge.js';
  import FeaturePage from '$lib/components/FeaturePage.svelte';
  import { getDoc, section } from '$lib/learning';

  // Content from the single source of truth — bridge-svelte/learning/payments.
  const doc = getDoc('payments');
  const paywall = section(doc, 'paywall');
  const ent = section(doc, 'Entitlements');

  const codeTabs = [
    paywall?.code[0] && { label: 'BridgePaywall', code: paywall.code[0].code, lang: 'svelte' },
    ent?.code[0] && { label: 'Entitlement gate', code: ent.code[0].code, lang: 'svelte' },
  ].filter(Boolean) as { label: string; code: string; lang: string }[];

  const related = [
    { label: 'Subscription', href: '/subscription' },
    { label: 'Feature Flags', href: '/flag-demo' },
  ];

  // Live entitlement readout — drives the recommended "gate a feature behind a
  // plan-granted entitlement" pattern. snapshot is reactive over the live channel.
  const entitlements = bridge.tenant.entitlements.snapshot;

  let probe = $state('ai_completions');
  // Derive from the reactive snapshot store (not the synchronous can()) so the
  // readout updates live on every entitlements.changed push.
  let can = $derived(($entitlements ?? {})[probe] === true);
</script>

<FeaturePage
  title="Paywall & entitlements"
  breadcrumb="Billing / Paywall"
  oneLiner="Gate features behind plan-granted entitlements & quotas — upgrades unlock them live."
  introHtml={paywall?.html ?? ''}
  {codeTabs}
  props={paywall?.props ?? null}
  underTheHoodHtml={ent?.html ?? ''}
  {related}
>
  {#snippet live()}
    <span class="pw-label">Current subscription</span>
    <BridgeSubscriptionStatus />

    <span class="pw-label">Entitlement check</span>
    <label class="pw-control">
      <span>can(</span>
      <input bind:value={probe} data-testid="entitlement-key" />
      <span>)</span>
    </label>
    <div class="pw-readout" data-on={can} data-testid="entitlement-result">
      {can ? 'true · feature unlocked' : 'false · not granted by current plan'}
    </div>

    <details class="pw-all">
      <summary>entitlements snapshot</summary>
      <pre>{JSON.stringify($entitlements ?? null, null, 2)}</pre>
    </details>
  {/snippet}
</FeaturePage>

<style>
  .pw-label {
    display: block;
    font: 600 9.5px ui-monospace, monospace;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-faint);
    margin: 0 0 8px;
  }
  .pw-label + .pw-label,
  :global(.pw-readout) + .pw-label {
    margin-top: 18px;
  }
  .pw-control {
    display: flex;
    align-items: center;
    gap: 4px;
    font: 600 13px ui-monospace, monospace;
    color: var(--text-muted);
    margin-bottom: 10px;
  }
  .pw-control input {
    padding: 6px 8px;
    border: 1px solid var(--border-2);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font: 600 12.5px ui-monospace, monospace;
    width: 12rem;
  }
  .pw-readout {
    padding: 10px 12px;
    border-radius: 8px;
    font: 600 12.5px ui-monospace, monospace;
    background: var(--danger-soft);
    color: var(--danger);
    border: 1px solid var(--danger);
  }
  .pw-readout[data-on='true'] {
    background: var(--live-soft);
    color: var(--live);
    border-color: var(--live);
  }
  .pw-all {
    margin-top: 16px;
  }
  .pw-all summary {
    cursor: pointer;
    font-size: 12px;
    color: var(--text-muted);
  }
  .pw-all pre {
    margin: 8px 0 0;
    padding: 12px;
    border-radius: 8px;
    background: var(--code-bg);
    color: #a9b1d6;
    font-size: 11px;
    overflow: auto;
  }
</style>
