<!--
  Every billing page from one file:

    src/routes/subscription/[...bridge]/+page.svelte
    <BridgeBillingRoutes />

  Serves, under `billing.base`:
    (the base)  the current plan, "Manage billing" and the plans to change to
    plan        the paywall: where the route guard sends a workspace whose app
                is not active. Once a plan is active it goes on to the page the
                person was headed for.
    success     a confirmation page
    error       where a failed checkout lands
  A return from checkout is confirmed on any of the first three. An unknown
  page gets the app's own 404.

  Customising, in rungs:
    1. `--bridge-*` CSS tokens restyle the pages.
    2. `frame(page, content)` replaces everything around the content on every
       page; `heading(page)` replaces each page's heading.
    3. To own one page, create it (`src/routes/subscription/plan/+page.svelte`):
       SvelteKit prefers the specific route, and the other pages keep working.
    4. Headless: PlanPicker, SubscriptionStatus, BillingPortalButton,
       CheckoutNotice and the `billing` and `plans` stores.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { readReturnTo, STANDARD_FLAGS } from '@nebulr-group/bridge-auth-core';
  import { peekConfig } from '../../core/client.js';
  import { flag } from '../../core/flags.js';
  import { parseBillingPage, ROUTE_PARAM, type BillingPage } from '../../core/routes.js';
  import { billing } from '../../core/stores.js';
  import BillingPortalButton from './BillingPortalButton.svelte';
  import CheckoutNotice from './CheckoutNotice.svelte';
  import PlanPicker from './PlanPicker.svelte';
  import SubscriptionStatus from './SubscriptionStatus.svelte';
  import { subscriptionMeta } from './plan-format.js';

  interface Props {
    /** Replaces everything around the content, on every page. */
    frame?: Snippet<[BillingPage, Snippet]>;
    /** Replaces each page's heading. */
    heading?: Snippet<[BillingPage]>;
    /** Where "Continue" on the success page goes. @default the return address, else `auth.afterSignIn` */
    redirectTo?: string;
    /** Confirm and announce a return from checkout. `false` leaves it to your own CheckoutNotice. @default true */
    checkoutNotice?: boolean;
  }

  let { frame, heading, redirectTo, checkoutNotice = true }: Props = $props();

  const config = peekConfig();
  const base = config?.billingBase ?? '/subscription';
  const manageHref = base || '/';
  const appActive = flag(config?.flagKeys.appActive ?? STANDARD_FLAGS.appActive);

  const current = $derived(parseBillingPage(page.params[ROUTE_PARAM]));
  const returnTo = $derived(readReturnTo(page.url, config?.returnToParam) ?? config?.afterSignIn ?? '/');
  const meta = $derived(subscriptionMeta($billing.value));

  const DEFAULT_HEADINGS: Record<BillingPage, string> = {
    manage: 'Subscription',
    plan: 'Choose a plan',
    success: "You're all set",
    error: "We couldn't confirm your payment",
  };

  // On the plan page: once a plan was chosen here and the app is active, go on.
  let chosen = $state(false);
  let leaving = false;

  $effect(() => {
    if (current !== 'plan' || !chosen || !$appActive || leaving) return;
    leaving = true;
    void goto(returnTo, { invalidateAll: true });
  });
</script>

{#snippet body(p: BillingPage)}
  {#if checkoutNotice && p !== 'error'}
    <CheckoutNotice onConfirmed={p === 'plan' ? () => (chosen = true) : undefined} />
  {/if}
  {#if heading}
    {@render heading(p)}
  {:else}
    <h1 class="bridge-billing-heading">{DEFAULT_HEADINGS[p]}</h1>
  {/if}

  {#if p === 'manage'}
    <p class="bridge-billing-text">Your plan, what it includes, and billing.</p>
    <div class="bridge-billing-summary" data-bridge-billing-summary>
      <div class="bridge-billing-summary-plan">
        <span class="bridge-billing-label">Current plan</span>
        <SubscriptionStatus class="bridge-billing-summary-status" />
        {#if meta}
          <span class="bridge-billing-summary-meta" data-bridge-billing-meta>{meta}</span>
        {/if}
      </div>
      <BillingPortalButton />
    </div>
    <PlanPicker heading="Change plan" />
  {:else if p === 'plan'}
    <p class="bridge-billing-text">Pick a plan to start using the app.</p>
    <PlanPicker onChanged={() => (chosen = true)} />
  {:else if p === 'success'}
    <p class="bridge-billing-text">Your plan is active.</p>
    <div class="bridge-billing-current">
      <span class="bridge-billing-label">Current plan</span>
      <SubscriptionStatus />
    </div>
    <a class="bridge-btn-primary bridge-billing-action" href={redirectTo ?? returnTo}>Continue</a>
  {:else if p === 'error'}
    <p class="bridge-billing-text">
      The payment may still have gone through. Check your subscription in a moment; if it has not changed, try again.
    </p>
    <a class="bridge-btn-primary bridge-billing-action" href={manageHref}>Back to subscription</a>
  {/if}
{/snippet}

{#if current}
  {@const p = current}
  {#snippet content()}
    {@render body(p)}
  {/snippet}
  <div data-bridge-billing-route={p} style="display: contents">
    {#if frame}
      {@render frame(p, content)}
    {:else}
      <div class="bridge-billing-page">
        {@render content()}
      </div>
    {/if}
  </div>
{/if}

<style>
  /* In the `bridge` layer with the stylesheet, so any CSS of the app wins. */
  @layer bridge {
    .bridge-billing-page {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      max-width: var(--bridge-billing-page-width, 60rem);
      margin: 0 auto;
      padding: var(--bridge-billing-page-padding, 3rem 1rem);
    }
  }
</style>
