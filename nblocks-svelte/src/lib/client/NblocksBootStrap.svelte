<script lang="ts">  
  import { beforeNavigate } from '$app/navigation';
  import { onMount } from 'svelte';
  import { createRouteGuard } from '../auth/route-guard.js';
  import { auth, startAutoRefresh } from '../shared/services/auth.service.js';

  // Props: require config to be passed by consumer, now including onBootstrapComplete
  let {onBootstrapComplete }: {
   
    onBootstrapComplete?: () => void
  } = $props();

  const { login } = auth;
  const guard = createRouteGuard();

  async function handleRoute(pathname: string, cancel?: () => void) {
    const decision = await guard.getNavigationDecision(pathname);    
    if (decision.type === 'login') {
      if (cancel) cancel();
      login();
      return;
    }
    if (decision.type === 'redirect' && window.location.pathname !== decision.to) {
      if (cancel) cancel();
      window.location.href = decision.to;
      return;
    }
  }

  onMount(async () => {        
      startAutoRefresh();
    
    // Signal completion
    if (onBootstrapComplete) onBootstrapComplete();
  });

  beforeNavigate(async ({ to, cancel }) => {
    if (!to) return;
    await handleRoute(to.url.pathname, cancel);
  });
</script>