<!--
  TBP-702 — the subscription page, the paywall and the checkout return pages,
  from one file.

    src/routes/subscription/[...bridge]/+page.svelte:
    <BridgeBillingRoutes />

  Serves, relative to wherever the catch-all lives:
    /subscription          the current plan, the plan picker and "Manage billing"
    /subscription/plan     the paywall: where a plan-less workspace is sent
    /subscription/success  where a completed checkout lands
    /subscription/error    where a failed checkout confirmation lands
  An unknown segment gets the app's own 404 (bridgeBootstrap's load throws it —
  a component cannot).

  Those are the defaults of `billing.manageRoute`, `billing.paywallRoute` and
  `billing.paymentErrorRoute`, so nothing Bridge redirects to is a 404. For an
  onboarding page at another address, render `<BridgePaywallPage />` there and
  point `billing.paywallRoute` at it.

  Customising, in rungs:
    1. `--bridge-*` CSS tokens restyle it.
    2. `frame(page, children)` replaces everything around the content on every
       page; `heading(page)` replaces each page's heading.
    3. To own one page outright, create it (`src/routes/subscription/plan/+page.svelte`):
       SvelteKit prefers the specific route over `[...bridge]`, and the other
       pages keep working.
    4. Headless: `PlanSelector`, `BridgeSubscriptionStatus`, `BillingPortalButton`
       and `subscriptionStore` are the pieces these pages are built from.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { untrack } from 'svelte';
  import { page } from '$app/stores';
  import { loadSubscription, subscriptionStore } from '../../../core/bridge-instance.js';
  import { BRIDGE_AUTH_ROUTE_PARAM, bridgeAuthBase } from '../../auth-routes.js';
  import { parseBridgeBillingRoute, type BridgeBillingPage } from '../../billing-routes.js';
  import PlanSelector from './PlanSelector.svelte';
  import BridgeSubscriptionStatus from './BridgeSubscriptionStatus.svelte';
  import BillingPortalButton from './BillingPortalButton.svelte';

  interface Props {
    /** Everything around the content, on every page. Receives the page name and
     *  the content to render. Replaces the default centred column entirely. */
    frame?: Snippet<[BridgeBillingPage, Snippet]>;
    /** Each page's heading. Replaces the default one. */
    heading?: Snippet<[BridgeBillingPage]>;
    /** Where "Continue" on the success page goes. @default '/' */
    redirectTo?: string;
  }

  let { frame, heading, redirectTo = '/' }: Props = $props();

  const rest = $derived($page.params[BRIDGE_AUTH_ROUTE_PARAM]);
  const route = $derived(parseBridgeBillingRoute(rest));
  // Links are relative to where the catch-all lives, not hard-coded to /subscription.
  const base = $derived(bridgeAuthBase($page.url.pathname, rest) || '/');
  const at = (sub: string) => (base === '/' ? `/${sub}` : `${base}/${sub}`);

  const DEFAULT_HEADINGS: Record<BridgeBillingPage, string> = {
    manage: 'Subscription',
    plan: 'Choose a plan',
    success: "You're all set",
    error: "We couldn't confirm your payment",
  };

  // Every page reads the subscription. The success page always re-reads it: the
  // checkout just changed it, and whatever the store holds predates that. Keyed
  // on the page, because moving between these pages reuses this component.
  $effect(() => {
    const current = route?.page;
    if (!current) return;
    untrack(() => {
      const { status, loading } = $subscriptionStore;
      if (current === 'success' || (!status && !loading)) {
        loadSubscription().catch(() => {
          /* surfaced via subscriptionStore.error */
        });
      }
    });
  });
</script>

{#snippet body(p: BridgeBillingPage)}
  {#if heading}
    {@render heading(p)}
  {:else}
    <h1 class="bridge-billing-heading">{DEFAULT_HEADINGS[p]}</h1>
  {/if}

  {#if p === 'manage'}
    <div class="bridge-billing-current">
      <span class="bridge-billing-label">Current plan</span>
      <BridgeSubscriptionStatus />
      <BillingPortalButton />
    </div>
    <PlanSelector successRedirect={at('success')} cancelRedirect={base} />
  {:else if p === 'plan'}
    <p class="bridge-billing-text">Pick a plan to start using the app.</p>
    <PlanSelector successRedirect={at('success')} cancelRedirect={at('plan')} />
  {:else if p === 'success'}
    <p class="bridge-billing-text">Your plan is active.</p>
    <div class="bridge-billing-current">
      <span class="bridge-billing-label">Current plan</span>
      <BridgeSubscriptionStatus />
    </div>
    <a class="bridge-btn-primary bridge-billing-action" href={redirectTo}>Continue</a>
  {:else if p === 'error'}
    <p class="bridge-billing-text">
      The payment may still have gone through. Check your subscription in a moment; if it
      has not changed, try again.
    </p>
    <a class="bridge-btn-primary bridge-billing-action" href={base}>Back to subscription</a>
  {/if}
{/snippet}

{#if route}
  {@const current = route.page}
  {#snippet content()}
    {@render body(current)}
  {/snippet}
  <div data-bridge-billing-route={current} style="display: contents">
    {#if frame}
      {@render frame(current, content)}
    {:else}
      <div class="bridge-billing-page">
        {@render content()}
      </div>
    {/if}
  </div>
{/if}

<style>
  /* The default frame. A `frame` snippet replaces it entirely. */
  .bridge-billing-page {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    max-width: var(--bridge-billing-page-width, 60rem);
    margin: 0 auto;
    padding: var(--bridge-billing-page-padding, 3rem 1rem);
  }

  .bridge-billing-heading {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
  }

  .bridge-billing-text {
    margin: 0;
    opacity: 0.8;
  }

  .bridge-billing-current {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }

  .bridge-billing-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.7;
  }

  .bridge-billing-action {
    align-self: flex-start;
    text-decoration: none;
  }
</style>
