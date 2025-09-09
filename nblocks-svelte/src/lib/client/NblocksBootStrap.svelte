<script lang="ts">
    import { beforeNavigate } from '$app/navigation';
    import { onMount } from 'svelte';
    import type { RouteGuardConfig } from '../auth/route-guard.js';
    import { createRouteGuard } from '../auth/route-guard.js';
    import { featureFlags } from '../shared/feature-flag.js';
    import { auth } from '../shared/services/auth.service.js';
    import type { NblocksConfig } from '../shared/types/config.js';
    import { initConfig } from './stores/config.store.js';
  
    // Props: require config to be passed by consumer
    let { routeConfig, config, onBootstrapComplete }: {
      routeConfig: RouteGuardConfig,
      config: NblocksConfig,
      onBootstrapComplete?: () => void
    } = $props();

    // Initialize configuration immediately
    initConfig(config);
  
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
      await handleRoute(path);
      featureFlags.refresh();
      if (onBootstrapComplete) {
        onBootstrapComplete();
      }
    });
  
    beforeNavigate(async ({ to, cancel }) => {
      if (!to) return;
      await handleRoute(to.url.pathname, cancel);
    });
  </script>
  