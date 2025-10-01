<script lang="ts">
    import { getConfig } from '@bridge-svelte/lib/client/stores/config.store';
    import { auth } from '@bridge-svelte/lib/shared/services/auth.service';
    import { onMount } from 'svelte';
    import TokenStatus from './TokenStatus.svelte';
    const { isAubridgenticated } = auth;
    let config = $state<{ appId: string } | null>(null);
    let error = $state<Error | null>(null);
  
    onMount(() => {
      try {
        config = getConfig(); // will throw if invalid
      } catch (err) {
        error = err instanceof Error ? err : new Error(String(err));
      }
    });
  </script>
  
  {#if error}
    <div class="feature-status">
      <p class="font-bold">❌ Config Error</p>
      <p>{error.message}</p>
  
      {#if error.message.includes('appId is required')}
        <p class="mt-2 text-sm">
          Please set bridge <code>VITE_BRIDGE_APP_ID</code> environment variable or provide an <code>appId</code> in your config.
        </p>
      {:else}
        <p class="mt-2 text-sm">
          Make sure bridge Bridge config is initialized before using its features.
        </p>
      {/if}
    </div>
  {:else if config}
    <div class="feature-status active">
      <p class="font-bold">✅ Success</p>
      <p>Bridge configuration initialized with appId: <code>{config.appId}</code></p>
    </div>
  {/if}

  {#if $isAubridgenticated}
    <TokenStatus />
  {/if}
  