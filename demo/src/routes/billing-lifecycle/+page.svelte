<script lang="ts">
  import BridgeSubscriptionStatus from '@bridge-svelte/lib/client/components/subscription/BridgeSubscriptionStatus.svelte';
  import BridgeBillingNotice from '@bridge-svelte/lib/client/components/subscription/BridgeBillingNotice.svelte';
  import { getBridgeAuth } from '@bridge-svelte/lib/core/bridge-instance.js';
  import {
    useBridge,
    deriveNoticeState,
    deriveSeverity,
    type BillingSubscriptionState,
    type BillingSubscriptionSnapshot,
    type BillingNoticeState,
  } from '@nebulr-group/bridge-auth-core';
  import { onMount } from 'svelte';

  // ── Lifecycle simulator ──────────────────────────────────────────────────
  // Every preset drives `useBridge().subscription.hydrate(state)` — a pure
  // client-side state patch with NO backend call. Both <BridgeSubscriptionStatus>
  // and <BridgeBillingNotice> read the same singleton, so they react instantly.
  // In production these same transitions arrive as realtime lifecycle events
  // (see the Event console below).
  const PLAN = { slug: 'pro', name: 'Pro' };
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

  type Preset = { id: string; label: string; state: BillingSubscriptionState };

  const presets: Preset[] = [
    { id: 'active', label: 'Active', state: { plan: PLAN, status: 'active', renewsAt: inDays(20) } },
    { id: 'trial', label: 'Trial — active', state: { plan: PLAN, status: 'trial', daysLeft: 14, endsAt: inDays(14), hasCardOnFile: false } },
    { id: 'trial_soon', label: 'Trial — ending soon', state: { plan: PLAN, status: 'trial', daysLeft: 2, endsAt: inDays(2), hasCardOnFile: false } },
    { id: 'cancel_eop', label: 'Cancel at period end', state: { plan: PLAN, status: 'cancel_at_period_end', endsAt: inDays(10) } },
    { id: 'past_due', label: 'Past due — card declined', state: { plan: PLAN, status: 'past_due', pastDueReason: 'card_declined', cardLast4: '4242' } },
    { id: 'past_due_trial', label: 'Past due — trial expired', state: { plan: PLAN, status: 'past_due', pastDueReason: 'trial_expired' } },
    { id: 'dunning', label: 'Dunning — retry scheduled', state: { plan: PLAN, status: 'past_due', pastDueReason: 'card_declined', cardLast4: '4242', nextRetryAt: inDays(3) } },
    { id: 'dunning_final', label: 'Dunning — final retry', state: { plan: PLAN, status: 'past_due', pastDueReason: 'card_declined', cardLast4: '4242', nextRetryAt: inDays(1), finalRetryAt: inDays(1) } },
    { id: 'locked', label: 'Locked (gate engaged)', state: { plan: PLAN, status: 'past_due', gateEngaged: true, recoveryUrl: '/billing' } },
    { id: 'canceled', label: 'Canceled', state: { plan: PLAN, status: 'canceled', endsAt: inDays(-1) } },
  ];

  // Live label so each button shows the SDK-derived notice state + severity.
  const noticeOf = (s: BillingSubscriptionState) => deriveNoticeState(s);
  const severityOf = (s: BillingSubscriptionState) => deriveSeverity(deriveNoticeState(s));

  let chassis = $state<'bar' | 'rail' | 'card'>('card');
  let mode = $state<'soft' | 'hard'>('soft');
  let activeId = $state<string | null>(null);

  function simulate(p: Preset) {
    activeId = p.id;
    useBridge().subscription.hydrate(p.state);
  }

  function resetToLive() {
    activeId = null;
    const ctx = getBridgeAuth().getApiContext();
    if (ctx.accessToken) {
      useBridge().subscription.mount({ apiBaseUrl: ctx.apiBaseUrl, accessToken: ctx.accessToken, appId: ctx.appId });
    }
  }

  // CTA override: keep the demo on-page (the default navigates to /billing) and,
  // when locked, treat the lockscreen CTA as a recovery so you're never trapped.
  function handleCta(state: BillingNoticeState) {
    logEvent('cta.click', { noticeState: state });
    if (state === 'dunning_exhausted') {
      const active = presets.find((p) => p.id === 'active');
      if (active) simulate(active);
    }
  }

  // ── Live snapshot + derived state ────────────────────────────────────────
  let snap = $state<BillingSubscriptionSnapshot>(useBridge().subscription.snapshot());
  const noticeState = $derived(deriveNoticeState(snap.state));
  const severity = $derived(deriveSeverity(noticeState));
  const locked = $derived(snap.state?.gateEngaged ?? false);

  // ── Dev event console — useBridge().handle(...) ──────────────────────────
  // Real SDK events from the realtime channel. createBridgeFlags() (in the
  // root layout) already called attachToRealtimeClient, so these fire live.
  // Fire usage on /subscription to see quota.updated / entitlements.changed.
  type LogRow = { id: number; ts: string; kind: string; payload: unknown };
  let events = $state<LogRow[]>([]);
  let _id = 0;
  function logEvent(kind: string, payload: unknown) {
    events = [{ id: ++_id, ts: new Date().toISOString().slice(11, 23), kind, payload }, ...events].slice(0, 30);
  }

  const EVENT_KINDS = [
    'payment.failed', 'payment.succeeded',
    'subscription.created', 'subscription.updated', 'subscription.canceled', 'subscription.reactivated',
    'subscription.trial_started', 'subscription.trial_ending_soon', 'subscription.trial_converted', 'subscription.trial_expired',
    'dunning.entered', 'dunning.retry_scheduled', 'dunning.recovered', 'dunning.exhausted',
    'quota.updated', 'entitlements.changed',
  ];

  onMount(() => {
    const unsub = useBridge().subscription.subscribe((s) => { snap = s; });
    const handlers: Record<string, (m: unknown) => void> = {};
    for (const k of EVENT_KINDS) handlers[k] = (m) => logEvent(k, m);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const off = useBridge().handle(handlers as any);
    return () => { unsub(); off(); };
  });
</script>

<div class="lifecycle-page">
  <h1>Billing lifecycle</h1>
  <p class="subtitle">
    The "under the hood" of Billing 2.0: billing moves through stages and your app reacts.
    Drive the SDK through every stage below and watch
    <code>&lt;BridgeSubscriptionStatus /&gt;</code> + <code>&lt;BridgeBillingNotice /&gt;</code> respond live —
    no backend calls, just <code>useBridge().subscription.hydrate(state)</code>.
  </p>

  <!-- ── Live SDK components ──────────────────────────────────────────────── -->
  <section class="panel">
    <div class="panel-head">
      <h2>Live SDK components</h2>
      <BridgeSubscriptionStatus />
    </div>

    <div class="controls">
      <label>Chassis
        <select bind:value={chassis}>
          <option value="bar">bar</option>
          <option value="rail">rail</option>
          <option value="card">card</option>
        </select>
      </label>
      <label>Mode
        <select bind:value={mode}>
          <option value="soft">soft (inline)</option>
          <option value="hard">hard (lockscreen when locked)</option>
        </select>
      </label>
      <span class="derived">
        notice: <code>{noticeState}</code> · severity: <code>{severity}</code>
        {#if locked}· <span class="locked-tag">LOCKED</span>{/if}
      </span>
    </div>

    <div class="notice-stage">
      {#if noticeState === 'active'}
        <div class="silent">No notice — the component renders nothing while billing is healthy (status <code>active</code>).</div>
      {/if}
      <BridgeBillingNotice {chassis} {mode} onActionClick={handleCta} />
    </div>
  </section>

  <!-- ── Stage simulator ─────────────────────────────────────────────────── -->
  <section class="panel">
    <h2>Stage simulator</h2>
    <p class="hint">Each button calls <code>subscription.hydrate(state)</code>. The captions show the SDK-derived notice state + severity.</p>
    <div class="preset-grid">
      {#each presets as p (p.id)}
        <button
          class="preset"
          class:active={activeId === p.id}
          data-sev={severityOf(p.state)}
          onclick={() => simulate(p)}
        >
          <span class="preset-label">{p.label}</span>
          <span class="preset-meta">{noticeOf(p.state)} · {severityOf(p.state)}</span>
        </button>
      {/each}
      <button class="preset preset--reset" onclick={resetToLive}>
        <span class="preset-label">↺ Reset to live</span>
        <span class="preset-meta">re-fetch GET /billing/state</span>
      </button>
    </div>

    <details class="snap">
      <summary>useBridge().subscription.snapshot()</summary>
      <pre>{JSON.stringify(snap, null, 2)}</pre>
    </details>
  </section>

  <!-- ── Dev event console ───────────────────────────────────────────────── -->
  <section class="panel">
    <div class="panel-head">
      <h2>SDK event console</h2>
      <button class="ghost" onclick={() => (events = [])}>clear</button>
    </div>
    <p class="hint">
      Registered via <code>useBridge().handle(&#123; ... &#125;)</code> — real events off the realtime channel.
      Fire usage on the <a href="/subscription">Subscription</a> page to see <code>quota.updated</code> /
      <code>entitlements.changed</code> arrive here. (Simulator buttons patch state directly and do not emit events.)
    </p>
    <ul class="event-log">
      {#each events as e (e.id)}
        <li>
          <span class="ev-ts">{e.ts}</span>
          <span class="ev-kind">{e.kind}</span>
          <pre class="ev-payload">{JSON.stringify(e.payload, null, 2)}</pre>
        </li>
      {:else}
        <li class="ev-empty">No events yet.</li>
      {/each}
    </ul>
  </section>
</div>

<style>
  .lifecycle-page {
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
    line-height: 1.5;
  }

  code {
    background: #f3f4f6;
    padding: 0.1rem 0.35rem;
    border-radius: 0.25rem;
    font-size: 0.8125rem;
  }

  .panel {
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1.25rem;
    margin: 1.25rem 0;
    background: #fff;
  }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }

  .panel h2 {
    margin: 0 0 0.75rem;
    font-size: 1.05rem;
    color: #1f2937;
  }
  .panel-head h2 { margin: 0; }

  .hint {
    margin: 0 0 1rem;
    font-size: 0.8125rem;
    color: #6b7280;
    line-height: 1.5;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px dashed #e5e7eb;
  }

  .controls label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: #374151;
  }

  .controls select {
    padding: 0.3rem 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
  }

  .derived {
    font-size: 0.8125rem;
    color: #6b7280;
    margin-left: auto;
  }

  .locked-tag {
    color: #f9fafb;
    background: #1f2937;
    padding: 0.05rem 0.4rem;
    border-radius: 0.25rem;
    font-size: 0.7rem;
    font-weight: 700;
  }

  .notice-stage {
    min-height: 3rem;
  }

  .silent {
    font-size: 0.8125rem;
    color: #9ca3af;
    font-style: italic;
    padding: 0.75rem;
    border: 1px dashed #e5e7eb;
    border-radius: 0.5rem;
  }

  .preset-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.6rem;
  }

  .preset {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    align-items: flex-start;
    text-align: left;
    padding: 0.6rem 0.75rem;
    border: 1px solid #e5e7eb;
    border-left: 4px solid #d1d5db;
    border-radius: 0.375rem;
    background: #fff;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s, transform 0.1s;
  }
  .preset:hover { transform: translateY(-1px); background: #f9fafb; }
  .preset.active { background: #eef2ff; border-color: #6366f1; }

  .preset[data-sev='info']     { border-left-color: #3b82f6; }
  .preset[data-sev='warn']     { border-left-color: #f59e0b; }
  .preset[data-sev='critical'] { border-left-color: #ef4444; }
  .preset[data-sev='locked']   { border-left-color: #1f2937; }

  .preset-label { font-size: 0.85rem; font-weight: 600; color: #1f2937; }
  .preset-meta { font-size: 0.7rem; color: #9ca3af; font-family: ui-monospace, monospace; }

  .preset--reset { border-left-color: #9ca3af; }

  .snap {
    margin-top: 1rem;
  }
  .snap summary {
    cursor: pointer;
    font-size: 0.8125rem;
    font-weight: 500;
    color: #374151;
  }
  .snap pre {
    margin: 0.5rem 0 0;
    padding: 0.75rem;
    background: #1f2937;
    color: #d1fae5;
    border-radius: 0.375rem;
    font-size: 0.7rem;
    overflow-x: auto;
  }

  .ghost {
    background: #f3f4f6;
    color: #374151;
    border: none;
    border-radius: 0.375rem;
    padding: 0.35rem 0.7rem;
    font-size: 0.75rem;
    cursor: pointer;
  }
  .ghost:hover { background: #e5e7eb; }

  .event-log {
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 360px;
    overflow-y: auto;
  }

  .event-log li {
    padding: 0.5rem 0;
    border-bottom: 1px solid #f3f4f6;
    font-size: 0.75rem;
  }

  .ev-ts { color: #9ca3af; margin-right: 0.5rem; font-family: ui-monospace, monospace; }
  .ev-kind { color: #4338ca; font-weight: 700; font-family: ui-monospace, monospace; }
  .ev-payload {
    margin: 0.25rem 0 0;
    color: #6b7280;
    font-size: 0.7rem;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .ev-empty { color: #9ca3af; font-style: italic; }
</style>
