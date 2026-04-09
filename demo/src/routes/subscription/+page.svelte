<script lang="ts">
  import PlanSelector from '@bridge-svelte/lib/client/components/subscription/PlanSelector.svelte';
  import { loadSubscription, subscriptionStore } from '@bridge-svelte/lib/core/bridge-instance.js';
  import { onMount } from 'svelte';

  const successUrl = 'http://localhost:3008/subscription/success';
  const cancelUrl = 'http://localhost:3008/subscription/cancel';

  onMount(() => {
    loadSubscription();
  });

  const storeState = $derived($subscriptionStore);
  const status = $derived(storeState.status);
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

  <!-- ── PlanSelector component ────────────────────────────────────────────── -->
  <PlanSelector
    {successUrl}
    {cancelUrl}
  />
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
</style>
