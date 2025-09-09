<script lang="ts">  
  import Navbar from '$lib/components/Navbar.svelte';
  import type { RouteGuardConfig } from '@nblocks-svelte/lib/auth/route-guard.js';
  import NblocksBootStrap from '@nblocks-svelte/lib/client/NblocksBootStrap.svelte';
  import type { NblocksConfig } from '@nblocks-svelte/lib/shared/types/config.js';
  import '../app.css';
  let { children } = $props();

  let loading = $state(true);
  const routeConfig: RouteGuardConfig = {
    rules: [
      { match: '/', public: true },
      { match: '/login', public: true },
      { match: new RegExp('^/auth/oauth-callback$'), public: true },
      { match: new RegExp('^/docs($|/)'), public: true },
      { match: '/beta*', featureFlag: 'beta-feature', redirectTo: '/' },
      { match: '/*', featureFlag:'global-feature', redirectTo: '/login'}
    ],
    defaultAccess: 'protected'
  };

  function onBootstrapComplete() {    
    loading = false;    
  }
  
  const config: NblocksConfig = {
    appId: import.meta.env.VITE_NBLOCKS_APP_ID,
    authBaseUrl: import.meta.env.VITE_NBLOCKS_AUTH_BASE_URL,
    backendlessBaseUrl: import.meta.env.VITE_NBLOCKS_BACKENDLESS_BASE_URL,
    callbackUrl: import.meta.env.VITE_NBLOCKS_CALLBACK_URL,
    teamManagementUrl: import.meta.env.VITE_NBLOCKS_TEAM_MANAGEMENT_URL,
    defaultRedirectRoute: '/',
    loginRoute: '/login',
    debug: import.meta.env.VITE_NBLOCKS_DEBUG === 'true'
  };
  
</script>
  <NblocksBootStrap routeConfig={routeConfig} {config} onBootstrapComplete={onBootstrapComplete} />

  {#if !loading}
  <Navbar />
  <main>
    {@render children()}
  </main>
  {/if}

