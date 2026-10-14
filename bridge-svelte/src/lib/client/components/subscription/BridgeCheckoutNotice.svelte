<!--
  TBP-813 — the "you're on Pro now" banner after a checkout.

  A completed checkout (or a Free pick) lands on `billing.successRoute`, the
  subscription page by default, which shows this banner itself. To land
  somewhere else and still say so, put it on that page or in the layout:

    <BridgeCheckoutNotice />

  It renders nothing until a checkout has just completed, shows once, and is
  gone after a reload. `children` replaces the text and receives the result;
  for a message of your own anywhere else, read `checkoutResult`.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onDestroy, onMount } from 'svelte';
  import { useBridge, type BillingSubscriptionSnapshot, type Plan } from '@nebulr-group/bridge-auth-core';
  import { subscriptionStore } from '../../../core/bridge-instance.js';
  import { checkoutResult, clearCheckoutResult, type BridgeCheckoutResult } from '../../checkout-result.js';

  interface Props {
    /** Optional class on the banner. */
    class?: string;
    /** Show a close button. @default true */
    dismissible?: boolean;
    /** Replaces the banner's text. Receives the result, with the plan name when known. */
    children?: Snippet<[Omit<BridgeCheckoutResult, 'planName'> & { planName: string | null }]>;
  }

  let { class: className = '', dismissible = true, children }: Props = $props();

  let shown = $state<BridgeCheckoutResult | null>(null);
  let snapshot = $state<BillingSubscriptionSnapshot | null>(null);
  const unsubs: Array<() => void> = [];

  onMount(() => {
    // Take the result as soon as it is set, so it shows once — including on a
    // page that is already open when a Free pick lands back on it.
    unsubs.push(
      checkoutResult.subscribe((value) => {
        if (!value) return;
        shown = value;
        queueMicrotask(clearCheckoutResult);
      }),
    );
    try {
      const sub = useBridge().subscription;
      snapshot = sub.snapshot();
      unsubs.push(sub.subscribe((s) => (snapshot = s)));
    } catch {
      /* Bridge not initialised: the banner goes without the plan name */
    }
  });

  onDestroy(() => unsubs.forEach((u) => u()));

  const planName = $derived.by<string | null>(() => {
    if (shown?.planName) return shown.planName;
    if (snapshot?.state?.plan.name) return snapshot.state.plan.name;
    const plan = $subscriptionStore.status?.plan;
    return plan && typeof plan === 'object' ? ((plan as Plan).name ?? null) : null;
  });
</script>

{#if shown}
  <div
    class={`bridge-checkout-notice ${className}`}
    data-bridge-checkout-notice
    data-kind={shown.kind}
    role="status"
  >
    <svg class="bridge-checkout-notice-icon" width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.6" />
      <path d="M6 10.2l2.6 2.6L14 7.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <div class="bridge-checkout-notice-body">
      {#if children}
        {@render children({ ...shown, planName })}
      {:else}
        <strong class="bridge-checkout-notice-title">
          {planName ? `You're on ${planName} now` : 'Your new plan is active'}
        </strong>
        <span class="bridge-checkout-notice-text">
          {shown.kind === 'checkout'
            ? 'Your payment went through and the new plan is active.'
            : 'The change takes effect right away.'}
        </span>
      {/if}
    </div>
    {#if dismissible}
      <button
        type="button"
        class="bridge-checkout-notice-close"
        aria-label="Dismiss"
        onclick={() => (shown = null)}
      >
        ×
      </button>
    {/if}
  </div>
{/if}
