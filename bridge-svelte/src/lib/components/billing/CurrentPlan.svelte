<!--
  The current-plan box: the plan, when it renews or ends, and what is on its
  way, so nothing about a change is left to a message that goes away.

    - a downgrade that waits for the end of the period: "Pro until 24 Dec 2026,
      then Free", with a button to keep the plan;
    - an upgrade that waits for its payment: "Upgrading to Mega…" with a
      spinner until the payment is confirmed (read again from Bridge every few
      seconds, and at once on a live update), then "You're on Mega now"; when
      the bank wants the payer to confirm, or the payment fails, it says so and
      gives one button;
    - everything else: the plan's name, its status and its renewal or end date.

  `<BridgeBillingRoutes>` shows it on the subscription page. Facts only: the
  buttons are for people with the `billingManage` flag.
-->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { onDestroy } from 'svelte';
  import { getBridge } from '../../core/client.js';
  import { canManageBilling } from '../../core/flags.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import { billing, plans } from '../../core/stores.js';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';
  import BillingPortalButton from './BillingPortalButton.svelte';
  import SubscriptionStatus from './SubscriptionStatus.svelte';
  import { formatDate, subscriptionMeta } from './plan-format.js';

  type Props = HTMLAttributes<HTMLDivElement>;

  let { class: className, style, ...rest }: Props = $props();

  /** After this long a payment still not confirmed is probably waiting for the payer's bank. */
  const SLOW_MS = 45_000;

  const canManage = canManageBilling();
  const facts = $derived($billing.value);
  const nameOf = (key: string): string => $plans.value?.find((p) => p.key === key)?.name ?? key;

  const scheduled = $derived(facts?.waiting?.waitsFor === 'period_end' && facts.plan !== null ? facts.waiting : null);
  const upgrading = $derived(facts?.waiting?.waitsFor === 'payment' && facts.plan !== null ? facts.waiting : null);
  const paymentFailed = $derived(facts !== null && (facts.access === 'payment_due' || facts.status === 'past_due'));
  const meta = $derived(scheduled ? '' : subscriptionMeta(facts));
  const until = $derived(scheduled ? formatDate(facts?.waiting?.at ?? facts?.periodEnd) : null);

  let keeping = $state(false);
  let keepError = $state<string | null>(null);

  async function keep(): Promise<void> {
    if (!facts?.plan || keeping) return;
    keeping = true;
    keepError = null;
    try {
      await getBridge().billing.keepPlan(facts.plan.key);
      await billing.refresh();
    } catch (error) {
      keepError = errorMessage(error, translator(), 'error.generic');
    } finally {
      keeping = false;
    }
  }

  // An upgrade waiting for its payment: since when, and what it was, to say "You're on Mega now" when it arrives.
  let waitingFor = $state<string | null>(null);
  let since = $state(0);
  let slow = $state(false);
  let arrived = $state<string | null>(null);
  let timer: ReturnType<typeof setInterval> | undefined;
  let slowTimer: ReturnType<typeof setTimeout> | undefined;

  function stopWatching(): void {
    clearInterval(timer);
    clearTimeout(slowTimer);
    timer = undefined;
    slowTimer = undefined;
  }

  // Read the facts again from Bridge (which asks the payment provider) while a payment is awaited: a live update moves it
  // at once when there is one, and this catches the payment when live updates are off.
  function watch(): void {
    stopWatching();
    slow = false;
    since = Date.now();
    slowTimer = setTimeout(() => (slow = true), SLOW_MS);
    const tick = async (): Promise<void> => {
      try {
        await getBridge().billing.refresh();
        await billing.refresh();
      } catch {
        // Try again at the next tick.
      }
      // Every 4 seconds for the first two minutes, then every 30.
      if (timer !== undefined && Date.now() - since > 120_000) {
        clearInterval(timer);
        timer = setInterval(tick, 30_000);
      }
    };
    timer = setInterval(tick, 4_000);
  }

  $effect(() => {
    const target = upgrading?.plan ?? null;
    if (target === waitingFor) return;
    const was = waitingFor;
    waitingFor = target;
    if (target !== null) {
      arrived = null;
      watch();
      return;
    }
    stopWatching();
    slow = false;
    if (was !== null && facts?.plan?.key === was) arrived = nameOf(was);
  });

  onDestroy(stopWatching);
</script>

<div
  class={['bridge-billing-summary', className]}
  {style}
  data-bridge-billing-summary
  data-change={scheduled ? 'scheduled' : upgrading ? 'upgrading' : arrived ? 'arrived' : 'none'}
  {...rest}
>
  <div class="bridge-billing-summary-plan">
    <span class="bridge-billing-label">Current plan</span>
    <SubscriptionStatus class="bridge-billing-summary-status" />
    {#if scheduled && facts?.plan}
      <span class="bridge-billing-summary-meta" data-bridge-billing-scheduled>
        {facts.plan.name}{until ? ` until ${until}` : ''}, then {nameOf(scheduled.plan)}
      </span>
    {:else if meta}
      <span class="bridge-billing-summary-meta" data-bridge-billing-meta>{meta}</span>
    {/if}
  </div>
  <div class="bridge-billing-summary-actions">
    {#if scheduled && facts?.plan && $canManage}
      <button type="button" class="bridge-btn-secondary" data-bridge-billing-keep disabled={keeping} onclick={keep}>
        {keeping ? 'Keeping…' : `Keep ${facts.plan.name}`}
      </button>
    {/if}
    <BillingPortalButton />
  </div>

  {#if keepError}
    <Alert class="bridge-billing-summary-note" variant="error">{keepError}</Alert>
  {/if}

  {#if upgrading}
    {#if paymentFailed}
      <div class="bridge-billing-summary-change" data-bridge-billing-upgrade data-state="failed" role="alert">
        <div>
          <strong>Your payment for {nameOf(upgrading.plan)} did not go through</strong>
          <span>
            {$canManage ? 'Update your card to finish the upgrade.' : 'Ask the workspace owner to update the card.'}
          </span>
        </div>
        <BillingPortalButton label="Update card" />
      </div>
    {:else}
      <div class="bridge-billing-summary-change" data-bridge-billing-upgrade data-state={slow ? 'slow' : 'confirming'} role="status">
        <Spinner size={18} />
        <div>
          <strong>Upgrading to {nameOf(upgrading.plan)}… confirming your payment</strong>
          {#if slow}
            <span>This is taking longer than usual. If your bank asked you to confirm the payment, do that now.</span>
          {/if}
        </div>
        {#if slow}
          <BillingPortalButton label="Confirm payment" />
        {/if}
      </div>
    {/if}
  {:else if arrived}
    <div class="bridge-billing-summary-change" data-bridge-billing-upgrade data-state="done" role="status">
      <div><strong>You're on {arrived} now</strong></div>
      <button type="button" class="bridge-checkout-notice-close" aria-label="Dismiss" onclick={() => (arrived = null)}>×</button>
    </div>
  {/if}
</div>
