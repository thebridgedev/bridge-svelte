<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { loadSubscription } from '@bridge-svelte/lib/core/bridge-instance.js';

  onMount(async () => {
    await loadSubscription();
    goto('/');
  });
</script>

<p>Setting up your plan…</p>
