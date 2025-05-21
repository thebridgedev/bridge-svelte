<script lang="ts">
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { auth } from '@nblocks-svelte/shared/services/auth.service';
  import { onMount } from 'svelte';
  const { isAuthenticated } = auth;


  onMount(() => {
    if (get(isAuthenticated)) {
      goto('/');
    }
  });
</script>

<div class="container">
  <h1>Protected Page</h1>
  
  {#if $isAuthenticated}
    <div class="content">
      <p class="message">
        This is a protected page. You can only see this content when you're logged in.
      </p>
      
      <div class="info-card">
        <h2>Authentication Status</h2>
        <p>You are currently authenticated</p>
      </div>
    </div>
  {:else}
    <p class="message">
      Please log in to view this content.
    </p>
  {/if}
</div>

<style>
  .container {
    text-align: center;
  }

  h1 {
    font-size: 2.5rem;
    color: #1f2937;
    margin-bottom: 2rem;
  }

  .content {
    max-width: 600px;
    margin: 0 auto;
  }

  .message {
    font-size: 1.25rem;
    color: #4b5563;
    margin-bottom: 2rem;
  }

  .info-card {
    background-color: #ffffff;
    padding: 2rem;
    border-radius: 0.5rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .info-card h2 {
    color: #3b82f6;
    margin-bottom: 1rem;
  }

  .info-card p {
    color: #6b7280;
  }
</style> 