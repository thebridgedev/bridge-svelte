<!--
  PlanSelector customization harness (TBP-451 / S2).

  <PlanSelector> exposes three snippet props for card customization:

    planCard        — replaces the WHOLE card (opt out of the built-in chrome)
    planDescription — replaces the built-in `<p class="bridge-plan-description">`
    planFooter      — appended after the built-in price buttons

  This page mounts the *partial* pair (planDescription + planFooter) so the
  built-in card chrome — plan name, price buttons, current-plan state — must
  keep working while the app-supplied markup renders around it. The full
  `planCard` replacement is mounted alongside it for contrast.

  Driven by bridge-api/e2e/playwright/tests/app-integration/plan-card-snippets.spec.ts.
-->
<script lang="ts">
  import PlanSelector from '@bridge-svelte/lib/client/components/subscription/PlanSelector.svelte';
  import { loadSubscription } from '@bridge-svelte/lib/core/bridge-instance.js';
  import { onMount } from 'svelte';

  onMount(() => {
    loadSubscription();
  });
</script>

<div class="snippets-page">
  <h1>Plan card customization</h1>
  <p class="subtitle">
    <code>planDescription</code> / <code>planFooter</code> override parts of the built-in card;
    <code>planCard</code> replaces it entirely.
  </p>

  <!-- ── Partial override: built-in card chrome + app-supplied slots ──────── -->
  <section data-testid="partial-override">
    <h2>Partial override <code>planDescription</code> + <code>planFooter</code></h2>

    <PlanSelector>
      {#snippet planDescription({ plan, isCurrent })}
        <p class="custom-description" data-testid="custom-description" data-plan-key={plan.key}>
          Custom copy for {plan.name}{isCurrent ? ' (your plan)' : ''}
        </p>
      {/snippet}

      {#snippet planFooter({ plan, isCurrent })}
        <div class="custom-footer" data-testid="custom-footer" data-plan-key={plan.key}>
          <span class="footer-badge">Custom footer · {plan.key}</span>
          {#if isCurrent}
            <span class="footer-current" data-testid="custom-footer-current">Active subscription</span>
          {/if}
        </div>
      {/snippet}
    </PlanSelector>
  </section>

  <!-- ── Full override: the built-in card never renders ───────────────────── -->
  <section data-testid="full-override">
    <h2>Full override <code>planCard</code></h2>

    <PlanSelector>
      {#snippet planCard({ plan, prices, isCurrent, interval, onPick })}
        <div class="replacement-card" data-testid="replacement-card" data-plan-key={plan.key}>
          <h3>{plan.name}</h3>
          <p data-testid="replacement-interval">interval: {interval}</p>
          <p data-testid="replacement-price-count">prices: {prices.length}</p>
          <button
            type="button"
            data-testid="replacement-pick"
            disabled={isCurrent}
            onclick={() => prices[0] && onPick(prices[0])}
          >
            {isCurrent ? 'Current plan' : `Pick ${plan.name}`}
          </button>
        </div>
      {/snippet}
    </PlanSelector>
  </section>
</div>

<style>
  .snippets-page {
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

  h2 {
    font-size: 1.05rem;
    color: #1f2937;
    margin: 0 0 0.75rem;
  }

  section {
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    padding: 1.25rem;
    margin: 1.5rem 0;
    background: #fff;
  }

  code {
    background: #f3f4f6;
    padding: 0.1rem 0.35rem;
    border-radius: 0.25rem;
    font-size: 0.8125rem;
  }

  .custom-description {
    margin: 0 0 0.75rem;
    font-size: 0.875rem;
    color: #4c1d95;
    font-style: italic;
  }

  .custom-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px dashed #e5e7eb;
  }

  .footer-badge {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 0.1rem 0.4rem;
    border-radius: 9999px;
    background: #ede9fe;
    color: #4c1d95;
  }

  .footer-current {
    font-size: 0.75rem;
    font-weight: 600;
    color: #065f46;
  }

  .replacement-card {
    border: 2px dashed #4f46e5;
    border-radius: 0.5rem;
    padding: 1rem;
  }

  .replacement-card h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    color: #1f2937;
  }

  .replacement-card p {
    margin: 0 0 0.35rem;
    font-size: 0.8125rem;
    color: #6b7280;
  }

  .replacement-card button {
    margin-top: 0.5rem;
    padding: 0.45rem 0.9rem;
    border: none;
    border-radius: 0.375rem;
    background: #4f46e5;
    color: #fff;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
  }

  .replacement-card button:disabled {
    background: #e5e7eb;
    color: #9ca3af;
    cursor: not-allowed;
  }
</style>
