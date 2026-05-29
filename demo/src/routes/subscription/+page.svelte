<script lang="ts">
  import PlanSelector from '@bridge-svelte/lib/client/components/subscription/PlanSelector.svelte';
  import BridgeQuotaBanner from '@bridge-svelte/lib/client/components/subscription/BridgeQuotaBanner.svelte';
  import { loadSubscription, subscriptionStore, getBridgeAuth } from '@bridge-svelte/lib/core/bridge-instance.js';
  import { useBridge } from '@nebulr-group/bridge-auth-core';
  import { onMount } from 'svelte';


  const storeState = $derived($subscriptionStore);
  const status = $derived(storeState.status);

  // ── US-10 usage probe ──────────────────────────────────────────────────
  // Fires real bridge.usage.report(...) SDK calls so the durable queue flushes
  // to POST /usage/ingest. Watch the queue status + the quota probe below.
  let metric = $state('num.clicks');
  let amount = $state(1);
  let fireLog = $state<{ ts: string; text: string }[]>([]);
  let queue = $state<unknown>(null);

  // ── US-11 / US-12 quota probe (live via useBridge) ─────────────────────
  // useBridge().quota() is configured + realtime-attached by createBridgeFlags,
  // so the counter ticks live on each quota.updated push. entitlements.can()
  // flips false at a hard cap (key = metric with dots → underscores).
  let quotaSnap = $state<Record<string, unknown> | null>(null);
  let entCan = $state(false);
  let entAll = $state<Record<string, boolean>>({});

  const entKey = (m: string) => m.replace(/\./g, '_');

  function refreshQuota() {
    try {
      quotaSnap = (useBridge().quota(metric) as Record<string, unknown> | undefined) ?? null;
      entCan = useBridge().entitlements.can(entKey(metric));
      entAll = useBridge().entitlements.all();
    } catch {
      /* stores not ready yet (pre-login) */
    }
  }

  // Typed view of the quota snapshot for the custom meter UI below.
  const meter = $derived.by(() => {
    const q = quotaSnap as
      | { used?: number; limit?: number; remaining?: number; percent_used?: number; warningLevel?: string | null }
      | null;
    if (!q || typeof q.limit !== 'number') return null;
    const limit = q.limit;
    const used = q.used ?? 0;
    const pct = typeof q.percent_used === 'number' ? q.percent_used : limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
    return {
      used,
      limit,
      remaining: typeof q.remaining === 'number' ? q.remaining : Math.max(0, limit - used),
      pct: Math.round(pct),
      warningLevel: q.warningLevel ?? null,
    };
  });

  // Distinguish "capped" (entitlement present + false) from "no hard cap on this metric" (absent).
  const hasEnt = $derived(entKey(metric) in entAll);

  async function refreshQueue() {
    try {
      queue = await getBridgeAuth().usage.getQueueStatus();
    } catch (e) {
      queue = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  function fire(times: number) {
    const usage = getBridgeAuth().usage;
    for (let i = 0; i < times; i++) usage.report(metric, amount);
    fireLog = [
      { ts: new Date().toISOString().slice(11, 23), text: `report("${metric}", ${amount}) ×${times}` },
      ...fireLog,
    ].slice(0, 15);
    setTimeout(() => {
      refreshQueue();
      refreshQuota();
    }, 400);
  }

  onMount(() => {
    loadSubscription();
    refreshQueue();
    refreshQuota();
    const unsubs: Array<() => void> = [];
    try {
      unsubs.push(useBridge().quotas.subscribe(() => refreshQuota()));
    } catch {
      /* ignore */
    }
    try {
      unsubs.push(useBridge().entitlementsStore.subscribe(() => refreshQuota()));
    } catch {
      /* ignore */
    }
    return () => unsubs.forEach((u) => u());
  });
</script>

<div class="subscription-page">
  <h1>Subscription Plans</h1>
  <p class="subtitle">
    Demonstrates <code>PlanSelector</code>, <code>subscriptionStore</code>, and
    <code>loadSubscription()</code> from <code>@nebulr-group/bridge-svelte</code>.
  </p>

  <!-- ── Live store state panel ───────────────────────────────────────────── -->
  <details class="store-panel">
    <summary>subscriptionStore state <span class="store-badge">{storeState.loading ? 'loading…' : storeState.error ? 'error' : 'loaded'}</span></summary>
    <pre class="store-pre">{JSON.stringify(storeState, null, 2)}</pre>
  </details>

  <!-- ── Status summary (reading the store outside the component) ─────────── -->
  {#if status}
    <div class="status-chips">
      {#if status.trial}
        <span class="chip chip--trial">Trial — {status.trialDaysLeft} day{status.trialDaysLeft === 1 ? '' : 's'} left</span>
      {/if}
      {#if status.paymentsEnabled}
        <span class="chip chip--active">Billing active</span>
      {/if}
      {#if status.shouldSelectPlan}
        <span class="chip chip--warn">No plan selected</span>
      {/if}
      {#if status.paymentFailed}
        <span class="chip chip--error">Payment failed</span>
      {/if}
      {#if status.plan}
        <span class="chip chip--plan">Current plan: {status.plan.name}</span>
      {/if}
    </div>
  {/if}

  <!-- ── US-10 usage probe ─────────────────────────────────────────────────── -->
  <section class="usage-probe">
    <h2>Usage probe <span class="us-tag">US-10</span></h2>
    <p class="probe-hint">
      Calls <code>bridge.usage.report(metric, amount)</code> through the SDK's durable queue →
      <code>POST /usage/ingest</code>. Verify counts in admin UI → Subscription Control.
    </p>
    <div class="probe-row">
      <label>Metric <input bind:value={metric} oninput={refreshQuota} /></label>
      <label>Amount <input type="number" min="1" bind:value={amount} /></label>
      <button class="probe-btn" onclick={() => fire(1)}>Fire ×1</button>
      <button class="probe-btn" onclick={() => fire(10)}>Fire ×10</button>
      <button class="probe-btn probe-btn--ghost" onclick={refreshQueue}>Refresh queue</button>
    </div>
    <div class="probe-grid">
      <div>
        <h3>getQueueStatus()</h3>
        <pre class="store-pre">{JSON.stringify(queue, null, 2)}</pre>
      </div>
      <div>
        <h3>Fired</h3>
        <ul class="fire-log">
          {#each fireLog as l (l.ts + l.text)}
            <li><span class="fire-ts">{l.ts}</span> {l.text}</li>
          {:else}
            <li class="fire-empty">nothing fired yet</li>
          {/each}
        </ul>
      </div>
    </div>
  </section>

  <!-- ── US-11 / US-12 quota probe ───────────────────────────────────────────── -->
  <section class="usage-probe">
    <h2>Quota probe <span class="us-tag">US-11 · US-12</span></h2>
    <p class="probe-hint">
      Live <code>useBridge().quota("{metric}")</code> + <code>&lt;BridgeQuotaBanner /&gt;</code>.
      Banner renders nothing under 80%; warn ≥80%, critical ≥95% / at cap. Fire the metric
      above and watch it climb (workspace must be on a plan that caps this metric).
    </p>

    <BridgeQuotaBanner metric={metric} chassis="rail" />

    <div class="probe-grid">
      <div>
        <h3>useBridge().quota("{metric}")</h3>
        <pre class="store-pre">{JSON.stringify(quotaSnap, null, 2)}</pre>
      </div>
      <div>
        <h3>entitlements.can("{entKey(metric)}")</h3>
        <div class="ent-readout" data-on={entCan}>
          {entCan ? 'true · allowed' : 'false · capped or not hydrated'}
        </div>
      </div>
    </div>
  </section>

  <!-- ── Quota-driven UX patterns ───────────────────────────────────────────── -->
  <section class="usage-probe">
    <h2>Quota-driven UX <span class="us-tag">how to use it</span></h2>
    <p class="probe-hint">
      Practical patterns built from <code>useBridge().quota("{metric}")</code> and
      <code>useBridge().entitlements.can("{entKey(metric)}")</code>: a custom meter, and an action
      that gates itself the moment a hard cap is hit. Use the action button (or the Fire buttons above)
      to drive it.
    </p>

    <!-- Custom quota meter built straight from the snapshot fields -->
    <div class="meter-block">
      <div class="meter-head">
        <span class="meter-label">{metric}</span>
        {#if meter}
          <span class="meter-count">{meter.used} / {meter.limit} · {meter.remaining} left</span>
        {:else}
          <span class="meter-count meter-none">no quota configured for this metric</span>
        {/if}
      </div>
      <div class="meter-track">
        <div class="meter-fill" data-level={meter?.warningLevel ?? 'ok'} style="width: {meter ? meter.pct : 0}%"></div>
      </div>
      {#if meter}
        <div class="meter-foot">{meter.pct}% used · warningLevel: <code>{meter.warningLevel ?? 'null'}</code></div>
      {/if}
    </div>

    <!-- Entitlement-gated action: disables itself when can() flips false at the cap -->
    <div class="gate-block">
      <button class="action-btn" disabled={hasEnt && !entCan} onclick={() => fire(1)}>
        Run action <span class="action-cost">(reports {amount} {metric})</span>
      </button>
      {#if !hasEnt}
        <span class="gate-state gate-neutral">no hard-cap entitlement for <code>{entKey(metric)}</code> — action is ungated</span>
      {:else if entCan}
        <span class="gate-state gate-ok"><code>can("{entKey(metric)}")</code> = true → allowed</span>
      {:else}
        <span class="gate-state gate-blocked"><code>can("{entKey(metric)}")</code> = false → blocked at cap. Upgrade to continue.</span>
      {/if}
    </div>

    <details class="ent-all">
      <summary>entitlements.all()</summary>
      <pre class="store-pre">{JSON.stringify(entAll, null, 2)}</pre>
    </details>
  </section>

  <!-- ── PlanSelector component ────────────────────────────────────────────── -->
  <PlanSelector />
</div>

<style>
  .subscription-page {
    padding: 2rem;
    max-width: 960px;
    margin: 0 auto;
  }

  h1 {
    margin-bottom: 0.5rem;
    color: #1f2937;
  }

  .subtitle {
    margin-bottom: 1.5rem;
    color: #6b7280;
    font-size: 0.875rem;
  }

  code {
    background: #f3f4f6;
    padding: 0.1rem 0.35rem;
    border-radius: 0.25rem;
    font-size: 0.8125rem;
  }

  /* ── Store panel ── */
  .store-panel {
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    margin-bottom: 1.5rem;
    overflow: hidden;
  }

  .store-panel summary {
    padding: 0.6rem 1rem;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    background: #f9fafb;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .store-badge {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.1rem 0.4rem;
    border-radius: 9999px;
    background: #e5e7eb;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .store-pre {
    margin: 0;
    padding: 1rem;
    font-size: 0.75rem;
    background: #1f2937;
    color: #d1fae5;
    overflow-x: auto;
    max-height: 280px;
  }

  /* ── Status chips ── */
  .status-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  .chip {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .chip--trial   { background: #fef3c7; color: #92400e; }
  .chip--active  { background: #d1fae5; color: #065f46; }
  .chip--warn    { background: #fef9c3; color: #713f12; }
  .chip--error   { background: #fee2e2; color: #991b1b; }
  .chip--plan    { background: #ede9fe; color: #4c1d95; }

  /* ── Usage probe ── */
  .usage-probe {
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1.25rem;
    margin: 1.5rem 0;
    background: #fff;
  }

  .usage-probe h2 {
    margin: 0 0 0.5rem;
    font-size: 1.05rem;
    color: #1f2937;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .us-tag {
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.1rem 0.4rem;
    border-radius: 9999px;
    background: #ede9fe;
    color: #4c1d95;
    letter-spacing: 0.05em;
  }

  .probe-hint {
    margin: 0 0 1rem;
    font-size: 0.8125rem;
    color: #6b7280;
  }

  .probe-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .probe-row label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: #374151;
  }

  .probe-row input {
    padding: 0.4rem 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }

  .probe-btn {
    padding: 0.45rem 0.9rem;
    border: none;
    border-radius: 0.375rem;
    background: #4f46e5;
    color: #fff;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
  }

  .probe-btn:hover { background: #4338ca; }

  .probe-btn--ghost {
    background: #f3f4f6;
    color: #374151;
  }

  .probe-btn--ghost:hover { background: #e5e7eb; }

  .probe-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .probe-grid h3 {
    margin: 0 0 0.4rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6b7280;
  }

  .fire-log {
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.75rem;
    max-height: 200px;
    overflow-y: auto;
  }

  .fire-log li {
    padding: 0.2rem 0;
    border-bottom: 1px solid #f3f4f6;
    color: #374151;
  }

  .fire-ts { color: #9ca3af; margin-right: 0.4rem; }
  .fire-empty { color: #9ca3af; font-style: italic; }

  .ent-readout {
    margin-top: 0.4rem;
    padding: 0.5rem 0.7rem;
    border-radius: 0.375rem;
    font-family: ui-monospace, monospace;
    font-size: 0.8125rem;
    font-weight: 600;
    background: #fee2e2;
    color: #991b1b;
  }
  .ent-readout[data-on='true'] {
    background: #d1fae5;
    color: #065f46;
  }

  /* ── Quota-driven UX ── */
  .meter-block { margin-bottom: 1.25rem; }

  .meter-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 0.35rem;
  }

  .meter-label { font-weight: 600; color: #1f2937; font-size: 0.875rem; }
  .meter-count { font-family: ui-monospace, monospace; font-size: 0.8rem; color: #6b7280; }
  .meter-none { font-style: italic; color: #9ca3af; }

  .meter-track {
    height: 10px;
    border-radius: 9999px;
    background: #e5e7eb;
    overflow: hidden;
  }

  .meter-fill {
    height: 100%;
    border-radius: 9999px;
    background: #3b82f6;
    transition: width 0.3s ease, background 0.2s;
  }
  .meter-fill[data-level='approaching'] { background: #f59e0b; }
  .meter-fill[data-level='critical']    { background: #ef4444; }

  .meter-foot {
    margin-top: 0.35rem;
    font-size: 0.75rem;
    color: #9ca3af;
  }

  .gate-block {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    padding: 0.85rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    background: #f9fafb;
  }

  .action-btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.375rem;
    background: #4f46e5;
    color: #fff;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
  }
  .action-btn:hover:not(:disabled) { background: #4338ca; }
  .action-btn:disabled {
    background: #e5e7eb;
    color: #9ca3af;
    cursor: not-allowed;
  }

  .action-cost { font-weight: 400; opacity: 0.85; }

  .gate-state { font-size: 0.8125rem; }
  .gate-ok { color: #065f46; }
  .gate-blocked { color: #991b1b; }
  .gate-neutral { color: #6b7280; }

  .ent-all { margin-top: 1rem; }
  .ent-all summary {
    cursor: pointer;
    font-size: 0.8125rem;
    font-weight: 500;
    color: #374151;
  }
  .ent-all .store-pre { margin-top: 0.5rem; border-radius: 0.375rem; }
</style>
