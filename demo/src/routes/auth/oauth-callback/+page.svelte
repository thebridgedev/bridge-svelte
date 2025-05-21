<script lang="ts">
  import { goto } from '$app/navigation';
  import { handleCallback } from '@nblocks-svelte/client/stores/auth.store';
  import { onMount } from 'svelte';

  onMount(async () => {
    const code = new URLSearchParams(window.location.search).get('code');    
    if (code) {
      try {
        await handleCallback(code);
      } catch (err) {
        console.error('Auth callback error:', err);
      }
    }
    goto('/');
  });
</script> 