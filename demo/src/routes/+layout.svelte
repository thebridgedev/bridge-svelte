<script lang="ts">  
  import Navbar from '$lib/components/Navbar.svelte';
  import type { RouteGuardConfig } from '@nblocks-svelte/lib/auth/route-guard.js';
  import NblocksBootStrap from '@nblocks-svelte/lib/client/NblocksBootStrap.svelte';
  import '../app.css';

  let loading = $state(true);
  const routeConfig: RouteGuardConfig = {
    rules: [
      { match: '/', public: true },
      { match: '/login', public: true },
      { match: new RegExp('^/auth/oauth-callback$'), public: true },
      { match: new RegExp('^/docs($|/)'), public: true },
      { match: '/beta*', featureFlag: 'beta-feature', redirectTo: '/' }
    ],
    defaultAccess: 'protected'
  };

  function onBootstrapComplete() {    
    loading = false;    
  }
  
</script>
  <NblocksBootStrap routeConfig={routeConfig} onBootstrapComplete={onBootstrapComplete} />

  {#if !loading}
  <Navbar />
  <main>
    <slot />
  </main>
  {/if}

