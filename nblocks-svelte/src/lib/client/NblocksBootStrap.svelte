<script lang="ts">
  import { browser } from '$app/environment';
  import { beforeNavigate } from '$app/navigation';
  import { onMount } from 'svelte';
  import type { RouteGuardConfig } from '../auth/route-guard.js';
  import { createRouteGuard } from '../auth/route-guard.js';
  import { featureFlags } from '../shared/feature-flag.js';
  import { auth, maybeRefreshNow, startAutoRefresh } from '../shared/services/auth.service.js';
  import type { NblocksConfig } from '../shared/types/config.js';
  import { nblocksConfig } from './stores/config.store.js';

  // Props: require config to be passed by consumer, now including onBootstrapComplete
  let { routeConfig, config, onBootstrapComplete }: {
    routeConfig: RouteGuardConfig,
    config: NblocksConfig,
    onBootstrapComplete?: () => void
  } = $props();

  // Initialize configuration immediately using the new store's method
  nblocksConfig.initConfig(config);
 

  const { login } = auth;
  const guard = createRouteGuard({ config: routeConfig });

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
    const path = window.location.pathname;
    // Ensure tokens are fresh if needed before flags/guard
    await maybeRefreshNow();

    // Load flags prior to guard if your guard depends on them
    await featureFlags.refresh();

    await handleRoute(path);

  //   if (browser) {
  //   startAutoRefresh();
  // }
    // 5) Signal completion
    if (onBootstrapComplete) onBootstrapComplete();
  });

  beforeNavigate(async ({ to, cancel }) => {
    if (!to) return;
    await handleRoute(to.url.pathname, cancel);
  });
</script>