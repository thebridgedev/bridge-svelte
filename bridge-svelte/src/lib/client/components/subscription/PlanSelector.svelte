<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import type { Plan, PriceOfferSdk } from '@nebulr-group/bridge-auth-core';
  import { getBridgeAuth, loadSubscription, subscriptionStore } from '../../../core/bridge-instance.js';
  import { getConfig } from '../../stores/config.store.js';
  import Alert from '../sdk-auth/shared/Alert.svelte';
  import Spinner from '../sdk-auth/shared/Spinner.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    successRedirect?: string;
    cancelRedirect?: string;
    onSelect?: (detail: { plan: Plan; price: PriceOfferSdk }) => void;
    planCard?: Snippet<[{ plan: Plan; prices: PriceOfferSdk[]; isCurrent: boolean; onPick: (price: PriceOfferSdk) => void }]>;
    emptyState?: Snippet;
    loadingState?: Snippet;
  }

  let {
    successRedirect = '/subscription',
    cancelRedirect = '/subscription',
    onSelect,
    planCard,
    emptyState,
    loadingState,
    class: className,
    style,
    ...rest
  }: Props = $props();

  let picking = $state(false);
  let pickError = $state<string | null>(null);

  const status = $derived($subscriptionStore.status);
  const plans = $derived($subscriptionStore.plans);
  const loading = $derived($subscriptionStore.loading);
  const storeError = $derived($subscriptionStore.error);

  type UiState = 'idle' | 'payment-failed' | 'setup-payments' | 'select-plan' | 'active' | 'trial';

  const uiState = $derived<UiState>((() => {
    if (!status) return 'idle';
    if (status.paymentFailed) return 'payment-failed';
    if (status.shouldSetupPayments) return 'setup-payments';
    if (status.shouldSelectPlan) return 'select-plan';
    if (status.trial) return 'trial';
    if (status.paymentsEnabled || status.plan) return 'active';
    return 'select-plan';
  })());

  // status.plan is a Plan object from the REST endpoint; a string from JWT-derived paths.
  const currentPlanKey = $derived(
    status?.plan
      ? typeof status.plan === 'string' ? status.plan : (status.plan as Plan).key
      : null
  );

  onMount(() => {
    // Only load if not already loaded
    if (!$subscriptionStore.status && !$subscriptionStore.loading) {
      loadSubscription();
    }
  });

  async function handlePick(plan: Plan, price: PriceOfferSdk): Promise<void> {
    picking = true;
    pickError = null;
    try {
      if (price.amount === 0) {
        // Free plan — select directly
        await getBridgeAuth().selectFreePlan(plan.key);
        await loadSubscription();
        onSelect?.({ plan, price });
      } else if (status?.paymentsEnabled) {
        // Already has payment method — change plan
        await getBridgeAuth().changePlan(plan.key, price);
        await loadSubscription();
        onSelect?.({ plan, price });
      } else {
        // Needs checkout — redirect to Stripe (or direct plan set when Stripe not configured)
        const base = getConfig().callbackUrl ?? `${window.location.origin}/auth/oauth-callback`;
        // Use {CHECKOUT_SESSION_ID} placeholder — Stripe substitutes it in-place,
        // avoiding the double-? bug that occurs when Stripe appends ?session_id= to a URL that already has query params.
        const successUrl = `${base}?stripe_success=1&session_id={CHECKOUT_SESSION_ID}&redirect=${encodeURIComponent(successRedirect)}`;
        const cancelUrl  = `${base}?stripe_cancel=1&redirect=${encodeURIComponent(cancelRedirect)}`;
        const session = await getBridgeAuth().startCheckout(plan.key, price, { successUrl, cancelUrl });
        if (session.sessionId === null) {
          // Stripe not configured — plan was set directly on the backend
          await loadSubscription();
          onSelect?.({ plan, price });
        } else {
          if (!session.checkoutUrl) throw new Error('Checkout session URL missing');
          window.location.href = session.checkoutUrl;
        }
      }
    } catch (err) {
      pickError = err instanceof Error ? err.message : 'Something went wrong';
    } finally {
      picking = false;
    }
  }

  async function goToPortal(): Promise<void> {
    try {
      await getBridgeAuth().redirectToPlanSelection();
    } catch (err) {
      pickError = err instanceof Error ? err.message : 'Failed to open billing portal';
    }
  }
</script>

<div
  class={className}
  {style}
  data-bridge-plan-selector
  data-loading={loading || picking}
  data-state={uiState}
  {...rest}
>
  {#if loading}
    {#if loadingState}
      {@render loadingState()}
    {:else}
      <div class="bridge-plan-loading">
        <Spinner />
      </div>
    {/if}
  {:else if storeError}
    <Alert variant="error">{storeError}</Alert>
  {:else}
    {#if pickError}
      <Alert variant="error">{pickError}</Alert>
    {/if}

    {#if uiState === 'payment-failed'}
      <div data-bridge-plan-payment-failed class="bridge-plan-payment-failed">
        <Alert variant="error">
          Your last payment failed. Please update your payment method to continue.
        </Alert>
        <button class="bridge-btn-primary bridge-plan-portal-btn" onclick={goToPortal}>
          Manage billing
        </button>
      </div>
    {/if}

    {#if plans && plans.length === 0}
      {#if emptyState}
        {@render emptyState()}
      {:else}
        <p class="bridge-plan-empty">No plans available.</p>
      {/if}
    {:else if plans}
      <div class="bridge-plan-cards" data-bridge-plan-cards>
        {#each plans as plan (plan.key)}
          {@const isCurrent = plan.key === currentPlanKey}
          {@const onPick = (price: PriceOfferSdk) => handlePick(plan, price)}

          {#if planCard}
            {@render planCard({ plan, prices: plan.prices, isCurrent, onPick })}
          {:else}
            <div
              data-bridge-plan-card
              data-current={isCurrent}
              data-trial={plan.trial}
              class="bridge-plan-card"
            >
              <div class="bridge-plan-card-header">
                <h3 class="bridge-plan-name">{plan.name}</h3>
                {#if plan.trial && (plan.trialDays ?? 0) > 0}
                  <span class="bridge-plan-trial-badge">{plan.trialDays}-day trial</span>
                {/if}
              </div>

              {#if plan.description}
                <p class="bridge-plan-description">{plan.description}</p>
              {/if}

              <div class="bridge-plan-prices">
                {#each plan.prices as price (price.recurrenceInterval + price.currency)}
                  <button
                    class="bridge-btn-primary bridge-plan-select-btn"
                    disabled={isCurrent || picking}
                    onclick={() => onPick(price)}
                  >
                    {#if isCurrent}
                      Current plan
                    {:else if price.amount === 0}
                      Select free plan
                    {:else}
                      {price.amount} {price.currency.toUpperCase()} / {price.recurrenceInterval}
                    {/if}
                  </button>
                {/each}

                {#if plan.prices.length === 0}
                  <button
                    class="bridge-btn-primary bridge-plan-select-btn"
                    disabled={isCurrent || picking}
                    onclick={() => handlePick(plan, { id: '', amount: 0, currency: 'usd', recurrenceInterval: 'month' })}
                  >
                    {isCurrent ? 'Current plan' : 'Select plan'}
                  </button>
                {/if}
              </div>
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  {/if}
</div>
