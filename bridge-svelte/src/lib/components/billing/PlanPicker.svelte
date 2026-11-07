<!--
  The plans on offer, as cards, with an interval switch (Monthly / Yearly)
  when the plans have more than one. Choosing a plan changes it, or sends the
  person to checkout when it needs a payment method; switching from a paid
  plan asks to confirm first.

  Only a person with the `billingManage` flag may choose. Anyone else sees
  the plans with the buttons off and a note to ask the workspace owner.

  `planCard` replaces a whole card; `planDescription` and `planFooter`
  replace parts of the default one.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onDestroy } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import type { Plan, PlanChange, Price } from '@nebulr-group/bridge-auth-core';
  import { getBridge } from '../../core/client.js';
  import { canManageBilling } from '../../core/flags.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import { billing, flagsStatus, plans } from '../../core/stores.js';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';
  import BillingPortalButton from './BillingPortalButton.svelte';
  import {
    formatAmount,
    formatPrice,
    intervalSuffix,
    isFreePick,
    minAmount,
    pickKind,
    pickLabel,
    planFeatures,
    trialDays,
  } from './plan-format.js';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** A heading above the plans, beside the interval switch. */
    heading?: string;
    /** The interval selected at first, when the plans offer it. @default 'year' */
    defaultInterval?: string;
    /** Called after the plan changed here (not when the person is sent to checkout). */
    onChanged?: (detail: { plan: Plan; change: PlanChange }) => void;
    /** Replaces a whole card. `prices` is the plan's full price list; `interval` is the selected one. */
    planCard?: Snippet<
      [{ plan: Plan; prices: readonly Price[]; isCurrent: boolean; interval: string; canChoose: boolean; onPick: (price?: Price) => void }]
    >;
    /** Replaces the default card's description. */
    planDescription?: Snippet<[{ plan: Plan; isCurrent: boolean }]>;
    /** Rendered at the bottom of the default card. */
    planFooter?: Snippet<[{ plan: Plan; isCurrent: boolean }]>;
    emptyState?: Snippet;
    loadingState?: Snippet;
  }

  let {
    heading,
    defaultInterval = 'year',
    onChanged,
    planCard,
    planDescription,
    planFooter,
    emptyState,
    loadingState,
    class: className,
    style,
    ...rest
  }: Props = $props();

  const canManage = canManageBilling();

  const INTERVAL_ORDER = ['day', 'week', 'month', 'year'];
  const INTERVAL_LABELS: Record<string, string> = { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' };

  let picking = $state(false);
  let pickError = $state<string | null>(null);
  let successNotice = $state<string | null>(null);
  let successTimer: ReturnType<typeof setTimeout> | undefined;
  let confirmTarget = $state<{ plan: Plan; price: Price | undefined } | null>(null);
  let confirmBusy = $state(false);
  let confirmError = $state<string | null>(null);
  let retrying = $state(false);
  let intervalOverride = $state<string | null>(null);

  const facts = $derived($billing.value);
  const currentKey = $derived(facts?.plan?.key ?? null);
  const loading = $derived($plans.value === null && $plans.error === null);
  const loadError = $derived($plans.value === null && $plans.error !== null ? errorMessage($plans.error, translator(), 'error.generic') : null);
  const list = $derived(($plans.value ?? []).filter((p) => !p.archived || p.key === currentKey));
  const flagsKnown = $derived($flagsStatus === 'ready' || $flagsStatus === 'error');

  const uiState = $derived.by(() => {
    if (!facts) return 'idle';
    if (facts.access === 'payment_due' || facts.status === 'past_due') return 'payment-failed';
    if (facts.plan === null || facts.access === 'needs_plan') return 'select-plan';
    if (facts.status === 'trialing') return 'trial';
    return 'active';
  });

  // Intervals any paid price is offered in, in a stable order.
  const availableIntervals = $derived.by(() => {
    const found = list.flatMap((plan) => plan.prices.filter((p) => p.amount > 0 && p.interval).map((p) => p.interval as string));
    const others = found.filter((i, at) => !INTERVAL_ORDER.includes(i) && found.indexOf(i) === at);
    return [...INTERVAL_ORDER.filter((i) => found.includes(i)), ...others];
  });
  const showIntervalTabs = $derived(availableIntervals.length >= 2);
  const selectedInterval = $derived.by(() => {
    if (intervalOverride && availableIntervals.includes(intervalOverride)) return intervalOverride;
    return availableIntervals.includes(defaultInterval) ? defaultInterval : (availableIntervals[0] ?? defaultInterval);
  });

  // Cheapest first, by each plan's cheapest price in any interval, so cards stay put on a tab switch.
  const sortedPlans = $derived([...list].sort((a, b) => minAmount(a) - minAmount(b)));
  const currentPlan = $derived(list.find((p) => p.key === currentKey) ?? null);
  const currentPlanName = $derived(currentPlan?.name ?? facts?.plan?.name ?? 'your current plan');

  function intervalLabel(interval: string): string {
    return INTERVAL_LABELS[interval] ?? interval.charAt(0).toUpperCase() + interval.slice(1);
  }

  // The prices a card shows under the selected interval: one button each. A
  // free or interval-less price shows under every tab.
  function pricesForInterval(plan: Plan): Price[] {
    const exact = plan.prices.filter((p) => p.interval === selectedInterval);
    if (exact.length > 0) return exact;
    const unbound = plan.prices.filter((p) => !p.interval);
    if (unbound.length > 0) return unbound;
    const free = plan.prices.find((p) => p.amount === 0);
    return free ? [free] : [];
  }

  function changeNotice(plan: Plan, price: Price | undefined, status: PlanChange['status']): string {
    switch (status) {
      case 'scheduled':
        return `You'll move to ${plan.name} at the end of this billing period.`;
      case 'waiting_for_payment':
        return `You'll move to ${plan.name} once the payment goes through.`;
      default:
        return `You're now on ${plan.name} (${formatPrice(price)}).`;
    }
  }

  function showSuccess(message: string): void {
    successNotice = message;
    clearTimeout(successTimer);
    successTimer = setTimeout(() => (successNotice = null), 6000);
  }

  onDestroy(() => clearTimeout(successTimer));

  /** Chooses the plan. True when the person is on their way to checkout. */
  async function choose(plan: Plan, price: Price | undefined): Promise<boolean> {
    const change = await getBridge().billing.choosePlan({
      plan: plan.key,
      ...(price ? { currency: price.currency } : {}),
      ...(price?.interval ? { interval: price.interval } : {}),
    });
    if (change.status === 'payment_required') {
      window.location.assign(change.checkout.url);
      return true;
    }
    await billing.refresh();
    showSuccess(changeNotice(plan, price, change.status));
    onChanged?.({ plan, change });
    return false;
  }

  // Switching away from a paid plan happens without checkout, so it is confirmed first.
  function needsConfirm(plan: Plan, price: Price | undefined): boolean {
    return !isFreePick(plan, price) && currentPlan !== null && currentPlan.key !== plan.key && minAmount(currentPlan) > 0;
  }

  async function handlePick(plan: Plan, price?: Price): Promise<void> {
    if (!$canManage || picking) return;
    pickError = null;
    if (needsConfirm(plan, price)) {
      confirmTarget = { plan, price };
      confirmError = null;
      return;
    }
    picking = true;
    let leaving = false;
    try {
      leaving = await choose(plan, price);
    } catch (error) {
      pickError = errorMessage(error, translator(), 'error.generic');
    } finally {
      if (!leaving) picking = false;
    }
  }

  async function confirmPlanChange(): Promise<void> {
    if (!confirmTarget) return;
    const { plan, price } = confirmTarget;
    confirmBusy = true;
    confirmError = null;
    let leaving = false;
    try {
      leaving = await choose(plan, price);
      confirmTarget = null;
    } catch (error) {
      confirmError = errorMessage(error, translator(), 'error.generic');
    } finally {
      if (!leaving) confirmBusy = false;
    }
  }

  async function retryPlans(): Promise<void> {
    retrying = true;
    try {
      await plans.refresh();
    } finally {
      retrying = false;
    }
  }
</script>

<div
  class={className}
  {style}
  data-bridge-plan-selector
  data-loading={loading || picking}
  data-state={uiState}
  data-can-manage={$canManage}
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
  {:else if loadError}
    <Alert variant="error">{loadError}</Alert>
    <div class="bridge-plan-empty" data-bridge-plan-empty>
      <button type="button" class="bridge-btn-primary" onclick={retryPlans} disabled={retrying}>
        {retrying ? 'Loading…' : 'Try again'}
      </button>
    </div>
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
          {$canManage
            ? 'Your last payment failed. Please update your payment method to continue.'
            : 'Your last payment failed. Ask the workspace owner to update the payment method.'}
        </Alert>
        <BillingPortalButton class="bridge-plan-portal-btn" />
      </div>
    {/if}

    {#if list.length === 0}
      {#if emptyState}
        {@render emptyState()}
      {:else}
        <div class="bridge-plan-empty" data-bridge-plan-empty>
          <p>No plans are available yet.</p>
        </div>
      {/if}
    {:else}
      {#snippet intervalTabs()}
        <div class="bridge-plan-interval-tabs" data-bridge-plan-interval-tabs role="group" aria-label="Billing interval">
          {#each availableIntervals as interval (interval)}
            <button
              type="button"
              class="bridge-plan-interval-tab"
              data-active={interval === selectedInterval}
              aria-pressed={interval === selectedInterval}
              onclick={() => (intervalOverride = interval)}
            >
              {intervalLabel(interval)}
            </button>
          {/each}
        </div>
      {/snippet}

      {#if heading}
        <div class="bridge-plan-head" data-bridge-plan-head>
          <h2 class="bridge-plan-heading">{heading}</h2>
          {#if showIntervalTabs}{@render intervalTabs()}{/if}
        </div>
      {:else if showIntervalTabs}
        {@render intervalTabs()}
      {/if}

      {#if flagsKnown && !$canManage}
        <p class="bridge-plan-manage-note" data-bridge-plan-manage-note>Ask the workspace owner to change the plan.</p>
      {/if}

      <div class="bridge-plan-cards" data-bridge-plan-cards>
        {#each sortedPlans as plan (plan.key)}
          {@const isCurrent = plan.key === currentKey}
          {@const onPick = (price?: Price) => handlePick(plan, price)}
          {@const visiblePrices = pricesForInterval(plan)}
          {@const kind = pickKind(plan, currentPlan)}
          {@const days = trialDays(plan)}
          {@const features = planFeatures(plan)}
          {@const buttonClass = [kind === 'current' || kind === 'switch' ? 'bridge-btn-secondary' : 'bridge-btn-primary', 'bridge-plan-select-btn']}

          {#if planCard}
            {@render planCard({ plan, prices: plan.prices, isCurrent, interval: selectedInterval, canChoose: $canManage, onPick })}
          {:else}
            <div
              data-bridge-plan-card
              data-plan={plan.key}
              data-current={isCurrent}
              data-trial={days !== null}
              data-pick={kind}
              class="bridge-plan-card"
            >
              {#if isCurrent}
                <span class="bridge-plan-current-flag" data-bridge-plan-current-flag>Your plan</span>
              {/if}
              <div class="bridge-plan-card-header">
                <h3 class="bridge-plan-name">{plan.name}</h3>
                {#if days !== null}
                  <span class="bridge-plan-trial-badge">{days}-day trial</span>
                {/if}
              </div>

              {#if visiblePrices[0]}
                <div class="bridge-plan-price" data-bridge-plan-price>
                  <span class="bridge-plan-price-amount">{formatAmount(visiblePrices[0].amount, visiblePrices[0].currency)}</span>
                  <span class="bridge-plan-price-interval">{intervalSuffix(visiblePrices[0])}</span>
                </div>
              {:else if plan.free}
                <div class="bridge-plan-price" data-bridge-plan-price>
                  <span class="bridge-plan-price-amount">Free</span>
                </div>
              {/if}

              {#if planDescription}
                {@render planDescription({ plan, isCurrent })}
              {:else if plan.description}
                <p class="bridge-plan-description">{plan.description}</p>
              {/if}

              {#if features.length > 0}
                <ul class="bridge-plan-features" data-bridge-plan-features aria-label={`Included in ${plan.name}`}>
                  {#each features as feature (feature.key)}
                    <li class="bridge-plan-feature" data-feature={feature.key}>
                      <svg class="bridge-plan-feature-check" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                      <span>{feature.name}</span>
                    </li>
                  {/each}
                </ul>
              {/if}

              <div class="bridge-plan-prices">
                {#each visiblePrices as price (`${price.interval ?? ''}:${price.currency}`)}
                  <button class={buttonClass} disabled={isCurrent || picking || !$canManage} onclick={() => onPick(price)}>
                    {pickLabel(kind, plan)}{#if visiblePrices.length > 1 && !isCurrent}{` · ${formatAmount(price.amount, price.currency)}`}{/if}
                  </button>
                {/each}

                {#if plan.prices.length === 0}
                  <button class={buttonClass} disabled={isCurrent || picking || !$canManage} onclick={() => onPick()}>
                    {pickLabel(kind, plan)}
                  </button>
                {:else if visiblePrices.length === 0}
                  <p class="bridge-plan-unavailable" data-bridge-plan-unavailable>
                    Not available {intervalLabel(selectedInterval).toLowerCase()}
                  </p>
                {/if}
              </div>

              {#if planFooter}
                {@render planFooter({ plan, isCurrent })}
              {/if}
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  {/if}

  {#if confirmTarget}
    <div
      class="bridge-plan-confirm-backdrop"
      data-bridge-plan-confirm
      role="dialog"
      aria-modal="true"
      aria-labelledby="bridge-plan-confirm-title"
      tabindex="-1"
    >
      <div class="bridge-plan-confirm">
        <h3 id="bridge-plan-confirm-title" class="bridge-plan-confirm-title">Change plan?</h3>
        <p class="bridge-plan-confirm-body">
          Switch from <strong>{currentPlanName}</strong> to
          <strong>{confirmTarget.plan.name}</strong> ({formatPrice(confirmTarget.price)}).
        </p>
        <p class="bridge-plan-confirm-note">Any price difference shows on your next invoice.</p>
        {#if confirmError}
          <Alert variant="error">{confirmError}</Alert>
        {/if}
        <div class="bridge-plan-confirm-actions">
          <button type="button" class="bridge-btn-secondary" disabled={confirmBusy} onclick={() => (confirmTarget = null)}>
            Cancel
          </button>
          <button type="button" class="bridge-btn-primary" data-bridge-plan-confirm-btn disabled={confirmBusy} onclick={confirmPlanChange}>
            {confirmBusy ? 'Switching…' : 'Confirm change'}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
