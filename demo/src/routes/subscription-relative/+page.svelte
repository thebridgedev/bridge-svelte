<script lang="ts">
  // Test harness route for the startCheckout URL normalization regression.
  // PlanSelector is intentionally given relative paths so that the e2e test
  // can assert that auth-core resolves them to absolute URLs before hitting
  // the /account/subscription/checkout endpoint.
  // Regression: stripe.service.ts rejected relative success_url/cancel_url
  // with 400 "Not a valid URL". Fix lives in auth-core bridge-auth.ts. (2026-04-15)
  import PlanSelector from '@bridge-svelte/lib/client/components/subscription/PlanSelector.svelte';
  import { loadSubscription } from '@bridge-svelte/lib/core/bridge-instance.js';
  import { onMount } from 'svelte';

  const successUrl = '/plan';
  const cancelUrl = '/plan';

  onMount(() => {
    loadSubscription();
  });
</script>

<div class="subscription-page">
  <h1>Subscription Plans (relative URL harness)</h1>
  <PlanSelector
    {successUrl}
    {cancelUrl}
  />
</div>

<style>
  .subscription-page {
    padding: 2rem;
    max-width: 960px;
    margin: 0 auto;
  }
</style>
