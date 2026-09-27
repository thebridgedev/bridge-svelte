<!--
  TBP-697 — quota numbers, entitlements and self-reported usage, written the way
  the billing guide teaches it: everything imported from the Svelte plugin, no
  second package, no hand-written quota fetch.

    useQuota(metric)            live numbers for your own UI (loading, never 0)
    $entitlements.can(key)      a feature on or off by plan (.ready = answered)
    bridge.usage.set / report   report usage from the browser — self-reported

  The inputs exist so the Playwright spec can point the page at a metric and an
  entitlement key it chose; a real app hard-codes them.
-->
<script lang="ts">
  import { bridge, entitlements, useQuota } from '@bridge-svelte/lib/index';

  let metric = $state('projects');
  let entitlementKey = $state('ai_completions');
  let gaugeValue = $state(1);

  // Level 2 — the numbers. A getter, because the metric key is itself reactive.
  const quota = useQuota(() => metric);

  const quotaState = $derived(quota.loading ? 'loading' : quota.unlimited ? 'unlimited' : 'limited');

  // Self-reported usage (a local-first / mobile app with no backend of its own).
  let setResult = $state<{ status: 'idle' | 'sending' | 'stored' | 'error'; message?: string }>({ status: 'idle' });
  let reported = $state(0);

  async function setGauge() {
    setResult = { status: 'sending' };
    try {
      await bridge.usage.set(metric, gaugeValue);
      setResult = { status: 'stored' };
    } catch (err) {
      setResult = { status: 'error', message: err instanceof Error ? err.message : String(err) };
    }
  }

  function reportOne() {
    bridge.usage.report(metric);
    reported += 1;
  }
</script>

<div class="page">
  <h1>Usage &amp; quotas</h1>
  <p class="lede">
    <strong>Counter or gauge?</strong> If deleting it frees room, it's a gauge and your app counts it
    (<code>bridge.usage.set</code>). If it happened, it's a counter and Bridge counts it
    (<code>bridge.usage.report</code>).
  </p>

  <div class="inputs">
    <label>Metric <input data-testid="metric-input" bind:value={metric} /></label>
    <label>Entitlement <input data-testid="entitlement-input" bind:value={entitlementKey} /></label>
  </div>

  <section>
    <h2><code>useQuota('{metric}')</code></h2>
    <div class="quota" data-testid="quota" data-state={quotaState}>
      {#if quota.loading}
        <span class="muted" data-testid="quota-summary">Loading…</span>
      {:else if quota.unlimited}
        <span data-testid="quota-summary">No limit on {metric} for this plan</span>
      {:else}
        <span data-testid="quota-summary">{quota.used} of {quota.limit} {metric}</span>
        <dl>
          <dt>remaining</dt><dd data-testid="quota-remaining">{quota.remaining}</dd>
          <dt>kind</dt><dd data-testid="quota-kind">{quota.kind}</dd>
          <dt>warning</dt><dd data-testid="quota-warning">{quota.warningLevel ?? 'none'}</dd>
        </dl>
      {/if}
    </div>
  </section>

  <section>
    <h2><code>$entitlements.can('{entitlementKey}')</code></h2>
    {#if !$entitlements.ready}
      <span class="muted" data-testid="entitlement" data-state="loading">Loading…</span>
    {:else if $entitlements.can(entitlementKey)}
      <span class="ok" data-testid="entitlement" data-state="granted">Your plan includes {entitlementKey}</span>
    {:else}
      <span class="no" data-testid="entitlement" data-state="denied">Your plan does not include {entitlementKey}</span>
    {/if}
  </section>

  <section>
    <h2>Report usage from the browser</h2>
    <p class="note">
      Self-reported: anything in the browser can send any number, so a frontend-only app cannot
      <em>enforce</em> a limit — only a backend can refuse the write. Use this when the data lives on
      the device (a local-first or mobile app); with a backend, report there.
    </p>
    <div class="row">
      <label>Value <input type="number" min="0" data-testid="gauge-value" bind:value={gaugeValue} /></label>
      <button type="button" onclick={setGauge}>bridge.usage.set('{metric}', {gaugeValue})</button>
      <span data-testid="set-result" data-state={setResult.status}>
        {setResult.status === 'stored' ? 'Stored' : setResult.status === 'error' ? setResult.message : ''}
      </span>
    </div>
    <div class="row">
      <button type="button" onclick={reportOne}>bridge.usage.report('{metric}')</button>
      <span data-testid="reported">{reported} reported</span>
    </div>
  </section>
</div>

<style>
  .page {
    padding: 2rem;
    max-width: 760px;
    margin: 0 auto;
  }
  .lede {
    color: #374151;
  }
  .inputs,
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: flex-end;
    margin: 0.75rem 0;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.8rem;
    font-weight: 600;
  }
  input {
    padding: 0.35rem 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
  }
  section {
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1rem 1.25rem;
    margin: 1rem 0;
  }
  h2 {
    font-size: 1rem;
    margin: 0 0 0.5rem;
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.2rem 1rem;
    margin: 0.5rem 0 0;
    font-size: 0.85rem;
  }
  dt {
    color: #6b7280;
  }
  dd {
    margin: 0;
  }
  .muted {
    color: #9ca3af;
  }
  .ok {
    color: #065f46;
  }
  .no {
    color: #991b1b;
  }
  .note {
    font-size: 0.85rem;
    color: #6b7280;
  }
  button {
    padding: 0.45rem 0.9rem;
    border: none;
    border-radius: 0.375rem;
    background: #4f46e5;
    color: #fff;
    font-size: 0.8rem;
    cursor: pointer;
  }
</style>
