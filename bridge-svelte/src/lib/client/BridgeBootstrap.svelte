<script lang="ts">
  import { beforeNavigate, goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { createRouteGuard } from '../auth/route-guard.js';
  import { getBridgeAuth } from '../core/bridge-instance.js';
  import { getConfig } from './stores/config.store.js';

  // Props: require config to be passed by consumer, now including onBootstrapComplete
  let {onBootstrapComplete }: {
    onBootstrapComplete?: () => void
  } = $props();

  const guard = createRouteGuard();

  async function handleRoute(pathname: string, cancel?: () => void) {
    const decision = await guard.getNavigationDecision(pathname);
    if (decision.type === 'login') {
      if (cancel) cancel();
      const { loginRoute } = getConfig();
      if (loginRoute) {
        goto(loginRoute);
      } else {
        getBridgeAuth().login();
      }
      return;
    }
    if (decision.type === 'redirect' && window.location.pathname !== decision.to) {
      if (cancel) cancel();
      window.location.href = decision.to;
      return;
    }
  }

  onMount(async () => {
    // Auth-core manages auto-refresh internally — no startAutoRefresh() needed
    if (onBootstrapComplete) onBootstrapComplete();
  });

  beforeNavigate(async ({ to, cancel }) => {
    if (!to) return;
    await handleRoute(to.url.pathname, cancel);
  });
</script>
