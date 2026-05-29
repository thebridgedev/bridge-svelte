<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import type { Plan, PriceOfferSdk } from '@nebulr-group/bridge-auth-core';
  import { subscriptionStore, loadSubscription } from '../../../core/bridge-instance.js';
  import PlanSelector from './PlanSelector.svelte';

  interface Props {
    /** Where to send the user after a successful Stripe payment. @default '/' */
    successRedirect?: string;
    /** Where to send the user if they cancel Stripe Checkout. @default '/' */
    cancelRedirect?: string;
    /** Called after free-plan or direct plan change (not the Stripe redirect path). Use for analytics side-effects. */
    onSelect?: (detail: { plan: Plan; price: PriceOfferSdk }) => void;
    /** Override the default "Choose a plan" heading. */
    heading?: Snippet;
    children?: Snippet;
  }

  let {
    successRedirect = '/',
    cancelRedirect = '/',
    onSelect,
    heading,
    children,
  }: Props = $props();

  const status = $derived($subscriptionStore.status);
  const loading = $derived($subscriptionStore.loading);

  onMount(() => {
    if (!$subscriptionStore.status && !$subscriptionStore.loading) {
      loadSubscription();
    }
  });

  // Show paywall only once the subscription status is known and the tenant
  // has no plan selected. Respects paymentsAutoRedirect: false (opt-out flag).
  const showPaywall = $derived(
    !loading &&
    !!status?.shouldSelectPlan &&
    status?.paymentsAutoRedirect !== false
  );
</script>

{#if showPaywall}
  <div class="bridge-paywall" role="dialog" aria-modal="true" aria-label="Choose a plan">
    <div class="bridge-paywall-panel">
      {#if heading}
        {@render heading()}
      {:else}
        <h2 class="bridge-paywall-heading">Choose a plan</h2>
      {/if}
      <PlanSelector {successRedirect} {cancelRedirect} {onSelect} />
    </div>
  </div>
{:else}
  {@render children?.()}
{/if}

<style>
  .bridge-paywall {
    position: fixed;
    inset: 0;
    z-index: 9000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: var(--bridge-paywall-bg, rgba(15, 23, 42, 0.72));
    backdrop-filter: blur(2px);
  }

  .bridge-paywall-panel {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: 100%;
    max-width: 42rem;
    max-height: 90vh;
    overflow-y: auto;
    padding: 2rem;
    border-radius: 0.75rem;
    background: var(--bridge-paywall-panel-bg, #ffffff);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  }

  .bridge-paywall-heading {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    text-align: center;
  }
</style>
