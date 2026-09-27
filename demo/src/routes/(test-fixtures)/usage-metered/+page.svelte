<!--
  TBP-275 — Metered / usage-based pricing demo + E2E harness.

  Purpose-built, deterministic surface for the bridge-api Playwright suite
  (e2e/playwright/tests/billing-metered/*). It exercises the full client slice:

    - `getBridgeAuth().usage.report(metric, value)` → POST /usage/ingest
    - live `quota.updated` pushes flowing into `useBridge().quota(metric)`
    - the `<BridgeQuotaBanner>` metered branch (estimate / overcap copy)
    - the new TBP-275 QuotaSnapshot fields: unitAmount, currency,
      overageEstimate, overcap

  Two metrics are rendered so US-A (distinct per-unit prices on one plan) and
  US-M (pure per-unit, limit 0) can be driven from a single page. Every value
  the tests assert on carries a stable `data-testid` so selectors never depend
  on layout/copy.

  Reporting a single event with a large `value` (one report() call) crosses a
  cap without spraying N events — the reporter batches 10 events / 1s, so one
  fat event flushes within ~1s and the realtime push updates the readout.
-->
<script lang="ts">
  import BridgeQuotaBanner from '@bridge-svelte/lib/client/components/subscription/BridgeQuotaBanner.svelte';
  import { getBridgeAuth } from '@bridge-svelte/lib/core/bridge-instance.js';
  import { useBridge, type QuotaSnapshot } from '@nebulr-group/bridge-auth-core';
  import { onMount } from 'svelte';

  // Default metrics the suite drives. Both are free-form (US-O — no catalog);
  // the plan's quota config decides whether each is metered and at what price.
  const DEFAULT_METRICS = ['demo.metric_a', 'demo.metric_b'];

  // Editable so a spec can point the harness at any metric name it provisioned.
  let metricsCsv = $state(DEFAULT_METRICS.join(','));
  const metrics = $derived(
    metricsCsv
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
  );

  // Amount reported per click. A single large value crosses a cap in one event.
  let amount = $state(1);

  // Per-metric live snapshot, refreshed on every quota.updated push.
  let snaps = $state<Record<string, QuotaSnapshot | undefined>>({});

  // Queue depth (events awaiting flush) — tests poll this to know a report has
  // been sent before asserting on the server-driven snapshot.
  let queueDepth = $state<number | null>(null);

  function refresh(): void {
    const next: Record<string, QuotaSnapshot | undefined> = {};
    for (const m of metrics) {
      try {
        next[m] = useBridge().quota(m) as QuotaSnapshot | undefined;
      } catch {
        // Stores not ready yet (pre-login) — leave undefined.
      }
    }
    snaps = next;
  }

  async function refreshQueue(): Promise<void> {
    try {
      const status = await getBridgeAuth().usage.getQueueStatus();
      queueDepth = (status as { depth?: number }).depth ?? null;
    } catch {
      queueDepth = null;
    }
  }

  function report(metric: string, times = 1): void {
    const usage = getBridgeAuth().usage;
    for (let i = 0; i < times; i++) usage.report(metric, amount);
    void refreshQueue();
    // Give the 1s auto-flush + realtime round-trip time, then re-read.
    setTimeout(() => {
      void refreshQueue();
      refresh();
    }, 1400);
  }

  onMount(() => {
    refresh();
    void refreshQueue();
    const unsubs: Array<() => void> = [];
    try {
      // Live: every quota.updated push re-renders the readout + banner.
      unsubs.push(useBridge().quotas.subscribe(() => refresh()));
    } catch {
      // useBridge stores not configured yet — refresh() on mount is best-effort.
    }
    return () => unsubs.forEach((u) => u());
  });

  function fmt(v: unknown): string {
    if (v === undefined || v === null) return '—';
    return String(v);
  }
</script>

<div class="usage-metered" data-testid="usage-metered-page">
  <h1>Metered usage (TBP-275)</h1>
  <p class="subtitle">
    Reports real <code>usage.report(metric, value)</code> events and renders the
    live <code>BridgeQuotaBanner</code> metered branch + raw
    <code>QuotaSnapshot</code> for each metric.
  </p>

  <!-- ── Controls ─────────────────────────────────────────────────────────── -->
  <section class="controls">
    <label>
      Metrics (csv)
      <input data-testid="metrics-input" bind:value={metricsCsv} />
    </label>
    <label>
      Amount / report
      <input data-testid="amount-input" type="number" min="1" bind:value={amount} />
    </label>
    <span class="queue" data-testid="queue-depth">queue: {fmt(queueDepth)}</span>
  </section>

  <!-- ── Per-metric panels ────────────────────────────────────────────────── -->
  {#each metrics as metric (metric)}
    {@const s = snaps[metric]}
    <section class="metric-panel" data-testid={`metric-panel-${metric}`}>
      <header>
        <h2 data-testid={`metric-name-${metric}`}>{metric}</h2>
        <div class="actions">
          <button data-testid={`report-${metric}-x1`} onclick={() => report(metric, 1)}>
            Report ×1
          </button>
          <button data-testid={`report-${metric}-x10`} onclick={() => report(metric, 10)}>
            Report ×10
          </button>
        </div>
      </header>

      <!-- The component under test: metered banner branch. -->
      <BridgeQuotaBanner {metric} />

      <!-- Raw snapshot readout — stable testids for deterministic assertions. -->
      <dl class="snapshot">
        <dt>policy</dt>
        <dd data-testid={`snap-policy-${metric}`}>{fmt(s?.policy)}</dd>
        <dt>used</dt>
        <dd data-testid={`snap-used-${metric}`}>{fmt(s?.used)}</dd>
        <dt>limit</dt>
        <dd data-testid={`snap-limit-${metric}`}>{fmt(s?.limit)}</dd>
        <dt>remaining</dt>
        <dd data-testid={`snap-remaining-${metric}`}>{fmt(s?.remaining)}</dd>
        <dt>unitAmount</dt>
        <dd data-testid={`snap-unitAmount-${metric}`}>{fmt(s?.unitAmount)}</dd>
        <dt>currency</dt>
        <dd data-testid={`snap-currency-${metric}`}>{fmt(s?.currency)}</dd>
        <dt>overageEstimate</dt>
        <dd data-testid={`snap-overageEstimate-${metric}`}>{fmt(s?.overageEstimate)}</dd>
        <dt>overcap</dt>
        <dd data-testid={`snap-overcap-${metric}`}>{fmt(s?.overcap)}</dd>
      </dl>
    </section>
  {/each}
</div>

<style>
  .usage-metered {
    max-width: 720px;
    margin: 0 auto;
    padding: 1.5rem;
    font: inherit;
  }

  .subtitle {
    color: #555;
    font-size: 0.9rem;
  }

  .controls {
    display: flex;
    align-items: flex-end;
    gap: 1rem;
    margin: 1rem 0;
    flex-wrap: wrap;
  }

  .controls label {
    display: flex;
    flex-direction: column;
    font-size: 0.8rem;
    gap: 0.25rem;
  }

  .controls input {
    padding: 0.4rem 0.5rem;
    border: 1px solid #ccc;
    border-radius: 0.375rem;
  }

  .queue {
    font-size: 0.8rem;
    color: #777;
    padding-bottom: 0.5rem;
  }

  .metric-panel {
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1rem;
    margin-bottom: 1.25rem;
  }

  .metric-panel header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }

  .metric-panel h2 {
    font-size: 1rem;
    margin: 0;
    font-family: ui-monospace, monospace;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .actions button {
    padding: 0.4rem 0.75rem;
    border: 1px solid #2563eb;
    background: #2563eb;
    color: white;
    border-radius: 0.375rem;
    cursor: pointer;
    font: inherit;
    font-size: 0.85rem;
  }

  .actions button:hover {
    background: #1d4ed8;
  }

  .snapshot {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 1rem;
    margin: 0.75rem 0 0;
    font-size: 0.85rem;
  }

  .snapshot dt {
    color: #6b7280;
    font-family: ui-monospace, monospace;
  }

  .snapshot dd {
    margin: 0;
    font-family: ui-monospace, monospace;
  }
</style>
