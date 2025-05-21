<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth } from '@nblocks-svelte/shared/services/auth.service';
  import { onMount } from 'svelte';

  const { handleCallback } = auth;
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