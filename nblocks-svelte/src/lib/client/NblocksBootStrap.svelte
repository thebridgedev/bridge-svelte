<script lang="ts">
    import { beforeNavigate } from '$app/navigation';
    import { onMount} from 'svelte';
    import { checkFeatureFlagProtection } from '../auth/feature-flag-route-guard';
    import type { FeatureFlagProtection } from '../auth/feature-flag-route-guard';
    import { createRouteGuard } from '../auth/route-guard';
    import { featureFlags } from '../shared/feature-flag';
    import { auth } from '../shared/services/auth.service';
  
    // Use $props to declare props
    let { publicRoutes = [], featureFlagProtections = [], onBootstrapComplete }: {
      publicRoutes: (string | RegExp)[],
      featureFlagProtections: FeatureFlagProtection[],
      onBootstrapComplete: () => void
    } = $props();
  
    const { login } = auth;
    const guard = createRouteGuard({ publicRoutes });
  
    onMount(async () => {
      const path = window.location.pathname;
      const hasTokens = Boolean(localStorage.getItem('nblocks_tokens'));
  
      if (guard.shouldRedirectToLogin(path) && !hasTokens) {
        login();
      }
      
      const redirectTo = await checkFeatureFlagProtection(path, featureFlagProtections);
      if (redirectTo) {
        window.location.href = redirectTo;
      }
  
      featureFlags.refresh();
      if (onBootstrapComplete) {
        onBootstrapComplete();
      }
    });
  
    beforeNavigate(async ({ to, cancel }) => {
      if (!to) return;
      if (guard.shouldRedirectToLogin(to.url.pathname)) {
        cancel();
        login();
      }
  
      const redirectTo = await checkFeatureFlagProtection(to.url.pathname, featureFlagProtections);
      if (redirectTo) {
        cancel();
        window.location.href = redirectTo;
      }
    });
  </script>
  