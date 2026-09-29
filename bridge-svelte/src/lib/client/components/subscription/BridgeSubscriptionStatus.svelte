<!--
  Billing 2.0 / Phase A / US-2 (TBP-248).

  Drop-in component that renders the workspace's current canonical plan name
  + subscription status. Reads `useBridge().subscription` (auth-core) which
  is the new billing-specific reactive surface — parallel to FF 2.0's
  `BridgeFlags`. Do NOT confuse with the older `<PlanSelector />` which
  consumes the Stripe-direct path via `subscriptionStore`.

  TBP-762 — reads through the plugin's billing store (core/billing-store.ts):
  it re-reads on a plan change, a renewed sign-in and tab focus, so the badge
  follows the plan without a reload. A read that meets an out-of-date sign-in
  renews it and retries; a failed read is retried once, and "Loading…" stays up
  meanwhile. "Subscription unavailable" only after that; with `debug: true` the
  reason is shown next to it.

  `fresh` (the checkout success page): show "Loading…" until a read started
  after this badge mounted has answered, so the plan it shows is the one the
  checkout just bought, never the one the store held before.
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    useBridge,
    type BillingSubscriptionSnapshot,
  } from '@nebulr-group/bridge-auth-core';
  import { ensureBillingState, refreshBillingState } from '../../../core/billing-store.js';
  import { isLoggerDebug } from '../../../shared/logger.js';
  import { subscriptionBadgeView } from './subscription-badge.js';

  interface Props {
    /** Optional class applied to the root span. */
    class?: string;
    /** Wait for a read made after mount before showing a plan. */
    fresh?: boolean;
  }

  let { class: className = '', fresh = false }: Props = $props();

  let snapshot = $state<BillingSubscriptionSnapshot>(useBridge().subscription.snapshot());
  // "Loading…" until this badge's own read has answered when it has nothing to
  // show yet (never a "No subscription" flash), or always on `fresh`.
  // svelte-ignore state_referenced_locally
  let awaiting = $state(fresh || snapshot.state === null);
  let unsubscribe: (() => void) | undefined;
  const debug = isLoggerDebug();

  onMount(() => {
    unsubscribe = useBridge().subscription.subscribe((snap) => {
      snapshot = snap;
    });
    const read = fresh ? refreshBillingState() : ensureBillingState();
    void read.finally(() => {
      awaiting = false;
    });
  });

  onDestroy(() => unsubscribe?.());

  const view = $derived(subscriptionBadgeView(snapshot, awaiting, debug));
</script>

<span class={`bridge-subscription-status ${className}`} data-state={view.kind}>
  {#if view.kind === 'loading'}
    <span class="bss-loading">Loading…</span>
  {:else if view.kind === 'error'}
    <span class="bss-error">Subscription unavailable</span>
    {#if view.reason}
      <span class="bss-error-reason" data-bridge-error-reason>({view.reason})</span>
    {/if}
  {:else if view.kind === 'plan'}
    <span class="bss-plan">{view.name}</span>
    <span class={`bss-badge bss-badge-${view.status}`}>{view.status}</span>
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
    background: var(--bridge-muted-bg, var(--bridge-bg-muted, #f3f4f6));
    color: var(--bridge-foreground, #111827);
  }

  .bss-badge-active {
    background: var(--bridge-alert-success-bg, #f0fdf4);
    color: var(--bridge-alert-success-fg, #166534);
  }

  .bss-badge-trial {
    background: var(--bridge-alert-info-bg, #eff6ff);
    color: var(--bridge-alert-info-fg, #1e40af);
  }

  .bss-badge-past_due,
  .bss-badge-cancel_at_period_end {
    background: var(--bridge-alert-warning-bg, #fffbeb);
    color: var(--bridge-alert-warning-fg, #92400e);
  }

  .bss-badge-canceled {
    background: var(--bridge-alert-error-bg, #fef2f2);
    color: var(--bridge-alert-error-fg, #991b1b);
  }

  .bss-loading,
  .bss-empty {
    color: var(--bridge-muted, #6b7280);
    font-style: italic;
  }

  .bss-error,
  .bss-error-reason {
    color: var(--bridge-alert-error-fg, #991b1b);
  }
</style>
