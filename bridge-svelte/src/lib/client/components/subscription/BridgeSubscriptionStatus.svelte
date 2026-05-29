<!--
  Billing 2.0 / Phase A / US-2 (TBP-248).

  Drop-in component that renders the workspace's current canonical plan name
  + subscription status. Reads `useBridge().subscription` (auth-core) which
  is the new billing-specific reactive surface — parallel to FF 2.0's
  `BridgeFlags`. Do NOT confuse with the older `<PlanSelector />` which
  consumes the Stripe-direct path via `subscriptionStore`.

  No live push in v1 — that's US-3. Fetches once on mount.
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    useBridge,
    type BillingSubscriptionSnapshot,
  } from '@nebulr-group/bridge-auth-core';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';

  interface Props {
    /** Optional class applied to the root span. */
    class?: string;
  }

  let { class: className = '' }: Props = $props();

  let snapshot = $state<BillingSubscriptionSnapshot>(useBridge().subscription.snapshot());
  let unsubscribe: (() => void) | undefined;

  onMount(() => {
    unsubscribe = useBridge().subscription.subscribe((snap) => {
      snapshot = snap;
    });

    const ctx = getBridgeAuth().getApiContext();
    if (!ctx.accessToken) {
      useBridge().subscription.setError('Not authenticated');
      return;
    }
    useBridge().subscription.mount({
      apiBaseUrl: ctx.apiBaseUrl,
      accessToken: ctx.accessToken,
      appId: ctx.appId,
    });
  });

  onDestroy(() => unsubscribe?.());
</script>

<span class={`bridge-subscription-status ${className}`}>
  {#if snapshot.loading}
    <span class="bss-loading">Loading…</span>
  {:else if snapshot.error}
    <span class="bss-error">Subscription unavailable</span>
  {:else if snapshot.state}
    <span class="bss-plan">{snapshot.state.plan.name}</span>
    <span class={`bss-badge bss-badge-${snapshot.state.status}`}>{snapshot.state.status}</span>
  {:else}
    <span class="bss-empty">No subscription</span>
  {/if}
</span>

<style>
  .bridge-subscription-status {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font: inherit;
  }

  .bss-plan {
    font-weight: 600;
  }

  .bss-badge {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: lowercase;
    background: #e5e7eb;
    color: #374151;
  }

  .bss-badge-active {
    background: #d1fae5;
    color: #065f46;
  }

  .bss-badge-trial {
    background: #dbeafe;
    color: #1e40af;
  }

  .bss-badge-past_due,
  .bss-badge-cancel_at_period_end {
    background: #fef3c7;
    color: #92400e;
  }

  .bss-badge-canceled {
    background: #fee2e2;
    color: #991b1b;
  }

  .bss-loading,
  .bss-empty {
    color: #6b7280;
    font-style: italic;
  }

  .bss-error {
    color: #b91c1c;
  }
</style>
