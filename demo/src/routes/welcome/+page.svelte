<script lang="ts">
  import PlanSelector from '@bridge-svelte/lib/client/components/subscription/PlanSelector.svelte';
  import { loadSubscription } from '@bridge-svelte/lib/core/bridge-instance.js';
  import { onMount } from 'svelte';

  onMount(() => {
    loadSubscription();
  });
</script>

<div class="welcome-page">
  <div class="hero">
    <div class="hero-badge">Getting started</div>
    <h1>Welcome — let's pick your plan</h1>
    <p class="hero-sub">
      You're one step away. Choose the plan that fits your team and unlock full access.
    </p>
  </div>

  <PlanSelector />
</div>

<style>
  .welcome-page {
    min-height: 100vh;
    background: #f8fafc;
    padding: 3rem 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .hero {
    text-align: center;
    max-width: 540px;
    margin-bottom: 2.5rem;
  }

  .hero-badge {
    display: inline-block;
    padding: 0.25rem 0.85rem;
    border-radius: 9999px;
    background: #ede9fe;
    color: #5b21b6;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 1rem;
  }

  h1 {
    font-size: 2rem;
    font-weight: 700;
    color: #111827;
    margin: 0 0 0.75rem;
    line-height: 1.2;
  }

  .hero-sub {
    color: #6b7280;
    font-size: 1rem;
    margin: 0;
    line-height: 1.6;
  }
</style>
