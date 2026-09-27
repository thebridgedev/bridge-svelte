<!--
  TBP-703 — plan limits in the UI, the three levels the billing guide teaches.

    Level 0  nothing. The backend refuses at the cap (402 QUOTA_EXCEEDED, what
             bridge-nestjs's @RequireQuota sends) and <BridgeBootstrap> opens
             the upgrade dialog. The buttons below are plain fetch / bridgeFetch.
    Level 1  <QuotaGate metric> disables the action at the cap before the click;
             <Entitled to> shows markup only when the plan grants the key.
    Level 2  useQuota / $entitlements for your own UI (see /usage-quota).

  The backend enforces; all of this only explains or anticipates the refusal.

  The inputs exist so the Playwright spec can point the gate at a metric and an
  entitlement key it chose; a real app hard-codes them.
-->
<script lang="ts">
  import { bridgeFetch, Entitled, QuotaGate } from '@bridge-svelte/lib/index';

  let gateMetric = $state('tickets');
  let entitlementKey = $state('analytics');
  let lastStatus = $state<number | null>(null);
  let created = $state(0);

  // Level 0 — this is all a page writes. No Bridge import, no quota check.
  async function createTicket() {
    const res = await fetch('/api/demo-backend/tickets', { method: 'POST' });
    lastStatus = res.status;
  }

  // Level 0 through bridgeFetch — the same, for a backend call that carries the
  // user's token (and a backend on another origin).
  async function exportReport() {
    const res = await bridgeFetch('/api/demo-backend/exports', { method: 'POST' });
    lastStatus = res.status;
  }

  // A 402 that is not a plan limit: the dialog stays shut.
  async function payWithDeclinedCard() {
    const res = await fetch('/api/demo-backend/card', { method: 'POST' });
    lastStatus = res.status;
  }

  async function createAllowed() {
    const res = await fetch('/api/demo-backend/ok', { method: 'POST' });
    lastStatus = res.status;
    if (res.ok) created += 1;
  }
</script>

<div class="page">
  <h1>Plan limits</h1>
  <p class="lede">
    <strong>The server decides; the UI explains.</strong> Your backend refuses a request at the plan's cap
    (<code>@RequireQuota</code> in bridge-nestjs). Everything on this page only shows that refusal, or anticipates it.
  </p>

  <section>
    <h2>Level 0 — no code: the upgrade dialog</h2>
    <p class="note">
      These buttons call the demo's stand-in backend, which answers like a workspace at its cap. The page has no
      Bridge code: <code>&lt;BridgeBootstrap&gt;</code> sees the <code>402 QUOTA_EXCEEDED</code> and opens the dialog.
    </p>
    <div class="row">
      <button type="button" data-testid="create-ticket" onclick={createTicket}>New ticket — fetch()</button>
      <button type="button" data-testid="export-report" onclick={exportReport}>Export — bridgeFetch()</button>
      <button type="button" class="secondary" data-testid="declined-card" onclick={payWithDeclinedCard}>
        Pay (card declined — not a plan limit)
      </button>
      <button type="button" class="secondary" data-testid="create-allowed" onclick={createAllowed}>
        Accepted request
      </button>
    </div>
    <p class="muted">
      Last response: <span data-testid="last-status">{lastStatus ?? '—'}</span> · created
      <span data-testid="created">{created}</span>
    </p>
  </section>

  <section>
    <h2>Level 1 — <code>&lt;QuotaGate metric="{gateMetric}"&gt;</code></h2>
    <label>Metric <input data-testid="gate-metric" bind:value={gateMetric} /></label>
    <div data-testid="gate">
      <QuotaGate metric={gateMetric}>
        <button type="button" data-testid="gated-action" onclick={createAllowed}>New {gateMetric}</button>
      </QuotaGate>
    </div>
    <p class="note">Enabled while loading, when the plan sets no limit, and for metered quotas. Disabled only at a known hard cap.</p>
  </section>

  <section>
    <h2>Level 1 — <code>&lt;Entitled to="{entitlementKey}"&gt;</code></h2>
    <label>Entitlement <input data-testid="entitled-key" bind:value={entitlementKey} /></label>
    <div data-testid="entitled">
      <Entitled to={entitlementKey}>
        <span class="ok" data-testid="entitled-feature">Your plan includes {entitlementKey}</span>
        {#snippet fallback()}
          <span class="no" data-testid="entitled-fallback">
            {entitlementKey} is on a higher plan. <a href="/subscription">Upgrade</a>
          </span>
        {/snippet}
        {#snippet loading()}
          <span class="muted" data-testid="entitled-loading">Checking your plan…</span>
        {/snippet}
      </Entitled>
    </div>
    <p class="note">
      Bridge turns every hard quota into an entitlement of the same name, false at the cap. Use
      <code>&lt;Entitled&gt;</code> for plan features and <code>&lt;QuotaGate&gt;</code> for counted things — don't wrap
      one around the other on the same key, or the upgrade prompt disappears with the button.
    </p>
  </section>

  <section>
    <h2>Level 2 — your own UI</h2>
    <p class="note">
      <code>useQuota(metric)</code> and <code>$entitlements.can(key)</code> give you the numbers and the answers —
      see <a href="/usage-quota">Usage &amp; quotas</a>.
    </p>
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
    margin-bottom: 0.75rem;
  }
  input {
    padding: 0.35rem 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    max-width: 16rem;
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
  button:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }
  button.secondary {
    background: #e5e7eb;
    color: #111827;
  }
</style>
