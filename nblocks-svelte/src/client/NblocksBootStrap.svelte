<script lang="ts">
    import { onMount } from 'svelte';
    import { beforeNavigate } from '$app/navigation';
    import { auth } from '../shared/services/auth.service';
    import { featureFlags } from '../shared/feature-flag';
    import { createRouteGuard } from '../lib/auth/route-guard';
  
    export let publicRoutes: (string | RegExp)[] = [];
  
    const { login } = auth;
    const guard = createRouteGuard({ publicRoutes });
  
    onMount(() => {
      const path = window.location.pathname;
      const hasTokens = Boolean(localStorage.getItem('nblocks_tokens'));
  
      if (guard.shouldRedirectToLogin(path) && !hasTokens) {
        login();
      }
  
      featureFlags.refresh();
    });
  
    beforeNavigate(({ to, cancel }) => {
      if (!to) return;
      if (guard.shouldRedirectToLogin(to.url.pathname)) {
        cancel();
        login();
      }
    });
  </script>
  