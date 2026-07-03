<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import type { Plan, PriceOfferSdk } from '@nebulr-group/bridge-auth-core';
  import { getBridgeAuth, loadSubscription, subscriptionStore } from '../../../core/bridge-instance.js';
  import { getConfig } from '../../stores/config.store.js';
  import Alert from '../sdk-auth/shared/Alert.svelte';
  import Spinner from '../sdk-auth/shared/Spinner.svelte';

  type BillingInterval = PriceOfferSdk['recurrenceInterval'];

  interface Props extends HTMLAttributes<HTMLDivElement> {
    successRedirect?: string;
    cancelRedirect?: string;
    /**
     * Which billing interval tab is selected by default (`'month'` | `'year'` |
     * `'week'` | `'day'`). Falls back to the first available interval when the
     * requested one isn't offered by any plan. Default: `'year'` (TBP-34 —
     * annual is the default; apps without yearly prices fall back gracefully).
     */
    defaultInterval?: BillingInterval;
    onSelect?: (detail: { plan: Plan; price: PriceOfferSdk }) => void;
    /** Custom card renderer. `prices` is the plan's full price list; `interval` is the active tab. */
    planCard?: Snippet<[{ plan: Plan; prices: PriceOfferSdk[]; isCurrent: boolean; interval: BillingInterval; onPick: (price: PriceOfferSdk) => void }]>;
    emptyState?: Snippet;
    loadingState?: Snippet;
  }

  let {
    successRedirect = '/subscription',
    cancelRedirect = '/subscription',
    defaultInterval = 'year',
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

  const INTERVAL_LABELS: Record<BillingInterval, string> = {
    day: 'Daily',
    week: 'Weekly',
    month: 'Monthly',
    year: 'Yearly',
  };

  // Distinct billing intervals offered by any *paid* price across all plans,
  // in a stable display order. (Free, amount-0 prices are interval-agnostic
  // and always shown, so they don't contribute a tab.)
  const availableIntervals = $derived.by<BillingInterval[]>(() => {
    const order: BillingInterval[] = ['day', 'week', 'month', 'year'];
    return order.filter((i) =>
      (plans ?? []).some((plan) =>
        plan.prices.some((p) => p.amount > 0 && p.recurrenceInterval === i),
      ),
    );
  });

  // Only render the toggle when there's a genuine choice (≥2 intervals).
  const showIntervalTabs = $derived(availableIntervals.length >= 2);

  // The user's explicit tab choice (null until they pick one). The effective
  // selection is derived — the override when still valid, else the requested
  // `defaultInterval`, else the first available. Kept as $derived (rather than
  // an $effect that writes state) so it reconciles automatically as plans load.
  let intervalOverride = $state<BillingInterval | null>(null);
  const selectedInterval = $derived.by<BillingInterval>(() => {
    if (intervalOverride && availableIntervals.includes(intervalOverride)) {
      return intervalOverride;
    }
    return availableIntervals.includes(defaultInterval)
      ? defaultInterval
      : (availableIntervals[0] ?? defaultInterval);
  });

  // Prices to show for a plan under the active tab: the matching interval, plus
  // any free (amount-0) prices which apply regardless of interval.
  function pricesForInterval(plan: Plan): PriceOfferSdk[] {
    return plan.prices.filter(
      (p) => p.amount === 0 || p.recurrenceInterval === selectedInterval,
    );
  }

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

  // ── Plan-change confirmation (TBP-33) ─────────────────────────────────
  // Switching an existing subscriber's plan is instant (no Stripe checkout
  // page), so it needs an explicit confirm step. Free selection and the
  // checkout redirect keep their existing single-click behavior.
  let confirmTarget = $state<{ plan: Plan; price: PriceOfferSdk } | null>(null);
  let confirmBusy = $state(false);
  let confirmError = $state<string | null>(null);
  let successNotice = $state<string | null>(null);
  let successTimer: ReturnType<typeof setTimeout> | undefined;

  const currentPlanName = $derived.by(() => {
    const found = (plans ?? []).find((p) => p.key === currentPlanKey);
    return found?.name ?? currentPlanKey ?? 'your current plan';
  });

  function formatPrice(price: PriceOfferSdk): string {
    return price.amount === 0
      ? 'Free'
      : `${price.amount} ${price.currency.toUpperCase()} / ${price.recurrenceInterval}`;
  }

  function showSuccess(message: string): void {
    successNotice = message;
    clearTimeout(successTimer);
    successTimer = setTimeout(() => (successNotice = null), 6000);
  }

  async function confirmPlanChange(): Promise<void> {
    if (!confirmTarget) return;
    const { plan, price } = confirmTarget;
    confirmBusy = true;
    confirmError = null;
    try {
      await getBridgeAuth().changePlan(plan.key, price);
      await loadSubscription();
      confirmTarget = null;
      showSuccess(`You're now on ${plan.name} (${formatPrice(price)}).`);
      onSelect?.({ plan, price });
    } catch (err) {
      // AC: failure surfaces inside the dialog, not just a banner.
      confirmError = err instanceof Error ? err.message : 'Plan change failed';
    } finally {
      confirmBusy = false;
    }
  }

  async function handlePick(plan: Plan, price: PriceOfferSdk): Promise<void> {
    picking = true;
    pickError = null;
    try {
      if (price.amount === 0 && !plan.hasCost) {
        // Free plan — select directly. TBP-275: guard on `!plan.hasCost` so a
        // $0-base plan that carries METERED pricing is NOT treated as free —
        // it falls through to checkout/changePlan below, capturing a payment
        // method so per-unit overage can be billed (US-C). Without this guard a
        // metered $0-base plan would hit selectFreePlan, which the backend now
        // rejects ("has a cost — use the checkout endpoint instead").
        await getBridgeAuth().selectFreePlan(plan.key);
        await loadSubscription();
        onSelect?.({ plan, price });
      } else if (status?.paymentsEnabled) {
        // Already has payment method — instant switch, so require an explicit
        // confirmation (TBP-33). The actual changePlan runs in confirmPlanChange.
        confirmTarget = { plan, price };
        confirmError = null;
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

    {#if successNotice}
      <div class="bridge-plan-success" data-bridge-plan-success role="status">
        <Alert variant="success">{successNotice}</Alert>
      </div>
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
      {#if showIntervalTabs}
        <div
          class="bridge-plan-interval-tabs"
          data-bridge-plan-interval-tabs
          role="group"
          aria-label="Billing interval"
        >
          {#each availableIntervals as interval (interval)}
            <button
              type="button"
              class="bridge-plan-interval-tab"
              data-active={interval === selectedInterval}
              aria-pressed={interval === selectedInterval}
              onclick={() => (intervalOverride = interval)}
            >
              {INTERVAL_LABELS[interval]}
            </button>
          {/each}
        </div>
      {/if}

      <div class="bridge-plan-cards" data-bridge-plan-cards>
        {#each plans as plan (plan.key)}
          {@const isCurrent = plan.key === currentPlanKey}
          {@const onPick = (price: PriceOfferSdk) => handlePick(plan, price)}
          {@const visiblePrices = pricesForInterval(plan)}

          {#if planCard}
            {@render planCard({ plan, prices: plan.prices, isCurrent, interval: selectedInterval, onPick })}
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
                {#each visiblePrices as price (price.recurrenceInterval + price.currency)}
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
                {:else if visiblePrices.length === 0}
                  <p class="bridge-plan-unavailable" data-bridge-plan-unavailable>
                    Not available {INTERVAL_LABELS[selectedInterval].toLowerCase()}
                  </p>
                {/if}
              </div>
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  {/if}

  {#if confirmTarget}
    <div class="bridge-plan-confirm-backdrop" data-bridge-plan-confirm role="dialog" aria-modal="true" aria-labelledby="bridge-plan-confirm-title" tabindex="-1">
      <div class="bridge-plan-confirm">
        <h3 id="bridge-plan-confirm-title" class="bridge-plan-confirm-title">Change plan?</h3>
        <p class="bridge-plan-confirm-body">
          Switch from <strong>{currentPlanName}</strong> to
          <strong>{confirmTarget.plan.name}</strong> ({formatPrice(confirmTarget.price)}).
        </p>
        <p class="bridge-plan-confirm-note">
          The change takes effect immediately — any price difference is prorated
          on your next invoice.
        </p>
        {#if confirmError}
          <Alert variant="error">{confirmError}</Alert>
        {/if}
        <div class="bridge-plan-confirm-actions">
          <button
            type="button"
            class="bridge-btn-secondary"
            disabled={confirmBusy}
            onclick={() => (confirmTarget = null)}
          >
            Cancel
          </button>
          <button
            type="button"
            class="bridge-btn-primary"
            data-bridge-plan-confirm-btn
            disabled={confirmBusy}
            onclick={confirmPlanChange}
          >
            {confirmBusy ? 'Switching…' : 'Confirm change'}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
