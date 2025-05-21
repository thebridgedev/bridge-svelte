<script lang="ts">
  import { onMount } from 'svelte';
  import { beforeNavigate, goto } from '$app/navigation';
  import { createRouteGuard } from '$lib/auth/route-guard';
  import { auth } from '@nblocks-svelte/shared/services/auth.service';
  import { featureFlags } from '@nblocks-svelte/shared/feature-flag';
  import Navbar from '$lib/components/Navbar.svelte';
  import '../app.css';

  let loading = true;

  const { login, isAuthenticated } = auth;

  const guard = createRouteGuard({
    publicRoutes: [
      '/', 
      '/login', 
      /^\/auth\/oauth-callback$/, 
      /^\/docs($|\/)/,
    ],
  });

  onMount(() => {
    // NOTE: If tokens are auto-loaded at module scope, this is safe
    const currentPath = window.location.pathname;
    const loggedIn = isAuthenticated && typeof isAuthenticated.subscribe === 'function'
      ? Boolean(localStorage.getItem('nblocks_tokens')) // fast direct check
      : false;

    if (guard.shouldRedirectToLogin(currentPath)) {
      login();
    }

    featureFlags.refresh(); // 👈 Fetch as early as possible
    loading = false;
  });

  beforeNavigate(({ to, cancel }) => {
    if (!to) return;
    if (guard.shouldRedirectToLogin(to.url.pathname)) {
      cancel();
      login();
    }
  });
</script>

{#if !loading}
  <Navbar />
  <main>
    <slot />
  </main>
{/if}
