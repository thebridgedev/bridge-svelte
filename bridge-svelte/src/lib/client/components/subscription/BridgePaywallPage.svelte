<!--
  TBP-702 — a paywall page at an address of the app's choosing, e.g. onboarding
  at /welcome:

    src/routes/welcome/+page.svelte:
    <BridgePaywallPage heading="Pick a plan to get started" />

    src/routes/+layout.ts — bridgeBootstrap({ …, billing: { paywallRoute: '/welcome' } })

  `<BridgeBillingRoutes>` already serves a paywall at /subscription/plan; this is
  only for an app that wants its own. The paywall redirect happens in the root
  `load`, before any page renders, so it has to know the address before this
  page has ever been visited — that is what the config line is for. Mounted
  anywhere else, this page says so in the dev console.

  A completed checkout lands on the subscription success page
  (`<billing.manageRoute>/success`); a cancelled one comes back here.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import type { Plan, PriceOfferSdk } from '@nebulr-group/bridge-auth-core';
  import { ensureSubscription } from '../../../core/bridge-instance.js';
  import { logger } from '../../../shared/logger.js';
  import { billingRoutes } from '../../billing-routes.js';
  import PlanSelector from './PlanSelector.svelte';

  interface Props {
    /** The page heading. @default 'Choose a plan' */
    heading?: string;
    /** Content between the heading and the plans — a welcome line, a checklist. */
    children?: Snippet;
    /** Where a completed checkout lands. @default `<billing.manageRoute>/success` */
    successRedirect?: string;
    /** Where a cancelled checkout lands. @default this page */
    cancelRedirect?: string;
    /** Called after a free-plan or direct plan change (not the Stripe redirect path). */
    onSelect?: (detail: { plan: Plan; price: PriceOfferSdk }) => void;
  }

  let { heading = 'Choose a plan', children, successRedirect, cancelRedirect, onSelect }: Props = $props();

  const routes = billingRoutes();

  // A literal `import.meta.env.DEV` read, so Vite replaces it in the app build;
  // guarded for a bundler without `import.meta.env`.
  function isDevBuild(): boolean {
    try {
      return import.meta.env.DEV === true;
    } catch {
      return false;
    }
  }
  const success = $derived(successRedirect ?? routes.successRoute);
  const cancel = $derived(cancelRedirect ?? $page.url.pathname);

  onMount(() => {
    // TBP-762 — the billing store: reuses a read younger than 30 s.
    void ensureSubscription();
    const here = $page.url.pathname;
    if (isDevBuild() && routes.paywallRoute !== here) {
      logger.warn(
        `[bridge] <BridgePaywallPage> is on ${here}, but plan-less workspaces are sent to ` +
          `${routes.paywallRoute ?? '(nowhere — the paywall redirect is off)'}. ` +
          `Add billing: { paywallRoute: '${here}' } to bridgeBootstrap() in +layout.ts.`
      );
    }
  });
</script>

<div class="bridge-paywall-page" data-bridge-paywall-page>
  <h1 class="bridge-paywall-page-heading">{heading}</h1>
  {@render children?.()}
  <PlanSelector successRedirect={success} cancelRedirect={cancel} {onSelect} />
</div>

<style>
  .bridge-paywall-page {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    max-width: var(--bridge-billing-page-width, 60rem);
    margin: 0 auto;
    padding: var(--bridge-billing-page-padding, 3rem 1rem);
  }

  .bridge-paywall-page-heading {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
  }
</style>
