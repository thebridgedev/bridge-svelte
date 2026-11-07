<!--
  Confirms a checkout the person just came back from, and says how it went.
  `<BridgeBillingRoutes>` shows it on its pages; to land a checkout anywhere
  else, put it on that page:

    <CheckoutNotice />

  It renders nothing unless the address is a return from checkout. It then
  confirms the checkout once, shows the outcome, takes the checkout's
  parameters off the address and fetches the billing facts again. `children`
  replaces the text.
-->
<script module lang="ts">
  import type { BillingFacts } from '@nebulr-group/bridge-auth-core';

  // One confirmation per checkout, however many notices are on the page.
  let lastConfirmation: { readonly session: string; readonly facts: Promise<BillingFacts> } | null = null;
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { readCheckoutReturn } from '@nebulr-group/bridge-auth-core';
  import { getBridge } from '../../core/client.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import { billing } from '../../core/stores.js';

  type Outcome =
    | { readonly state: 'confirming' }
    | { readonly state: 'success'; readonly planName: string | null }
    | { readonly state: 'failed'; readonly error: string };

  interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    /** Show a close button once the outcome is known. @default true */
    dismissible?: boolean;
    /** Called once the checkout is confirmed, with the new facts. */
    onConfirmed?: (facts: BillingFacts) => void;
    /** Replaces the text. */
    children?: Snippet<[Outcome]>;
  }

  let { dismissible = true, onConfirmed, children, class: className, style, ...rest }: Props = $props();

  let outcome = $state<Outcome | null>(null);

  function cleanAddress() {
    const url = new URL(location.href);
    url.searchParams.delete('stripe_success');
    url.searchParams.delete('session_id');
    try {
      replaceState(url, page.state);
    } catch {
      // The router is not ready yet: the address keeps the parameters.
    }
  }

  onMount(() => {
    const checkout = readCheckoutReturn(location.href);
    if (checkout === null) return;
    let alive = true;
    outcome = { state: 'confirming' };
    let confirmation = lastConfirmation;
    const first = confirmation === null || confirmation.session !== checkout.session;
    if (confirmation === null || confirmation.session !== checkout.session) {
      confirmation = { session: checkout.session, facts: getBridge().billing.confirmCheckout(checkout.session) };
      lastConfirmation = confirmation;
    }
    confirmation.facts
      .then(
        (facts) => {
          if (!alive) return;
          outcome = { state: 'success', planName: facts.plan?.name ?? null };
          onConfirmed?.(facts);
        },
        (error: unknown) => {
          if (alive) outcome = { state: 'failed', error: errorMessage(error, translator(), 'error.generic') };
        },
      )
      .finally(() => {
        if (!first) return;
        cleanAddress();
        void billing.refresh();
      });
    return () => {
      alive = false;
    };
  });
</script>

{#if outcome}
  <div
    class={['bridge-checkout-notice', className]}
    {style}
    data-bridge-checkout-notice
    data-state={outcome.state}
    role={outcome.state === 'failed' ? 'alert' : 'status'}
    {...rest}
  >
    <svg class="bridge-checkout-notice-icon" width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.6" />
      {#if outcome.state === 'failed'}
        <path d="M10 5.5v5.5M10 14v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      {:else if outcome.state === 'success'}
        <path d="M6 10.2l2.6 2.6L14 7.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      {/if}
    </svg>
    <div class="bridge-checkout-notice-body">
      {#if children}
        {@render children(outcome)}
      {:else if outcome.state === 'confirming'}
        <strong class="bridge-checkout-notice-title">Confirming your payment…</strong>
      {:else if outcome.state === 'success'}
        <strong class="bridge-checkout-notice-title">
          {outcome.planName ? `You're on ${outcome.planName} now` : 'Your new plan is active'}
        </strong>
        <span class="bridge-checkout-notice-text">Your payment went through and the new plan is active.</span>
      {:else}
        <strong class="bridge-checkout-notice-title">We couldn't confirm your payment</strong>
        <span class="bridge-checkout-notice-text">
          {outcome.error} The payment may still have gone through; check your plan again in a moment.
        </span>
      {/if}
    </div>
    {#if dismissible && outcome.state !== 'confirming'}
      <button type="button" class="bridge-checkout-notice-close" aria-label="Dismiss" onclick={() => (outcome = null)}>×</button>
    {/if}
  </div>
{/if}
