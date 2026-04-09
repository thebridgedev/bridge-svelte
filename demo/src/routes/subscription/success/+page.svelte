<script lang="ts">
  import { loadSubscription } from '@bridge-svelte/lib/core/bridge-instance.js';
  import { onMount } from 'svelte';

  onMount(() => {
    // Refresh subscription status after successful Stripe checkout
    loadSubscription();
  });
</script>

<div class="success-page">
  <div class="success-card">
    <h1>Payment successful</h1>
    <p>Your subscription has been activated. Thank you!</p>
    <a href="/" class="btn-home">Go to home</a>
  </div>
</div>

<style>
  .success-page {
    padding: 4rem 2rem;
    display: flex;
    justify-content: center;
  }

  .success-card {
    text-align: center;
    max-width: 400px;
  }

  h1 {
    color: #1f2937;
    margin-bottom: 0.75rem;
  }

  p {
    color: #6b7280;
    margin-bottom: 1.5rem;
  }

  .btn-home {
    display: inline-block;
    padding: 0.625rem 1.25rem;
    background-color: #3b82f6;
    color: white;
    border-radius: 0.375rem;
    text-decoration: none;
    font-size: 0.875rem;
  }

  .btn-home:hover {
    background-color: #2563eb;
  }
</style>
