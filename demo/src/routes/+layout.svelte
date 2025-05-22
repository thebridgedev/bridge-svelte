<script lang="ts">  
  import Navbar from '$lib/components/Navbar.svelte';
  import NblocksBootStrap from '@nblocks-svelte/client/NblocksBootStrap.svelte';
  import '../app.css';

  let loading = $state(true);
  const PUBLIC_ROUTES = [
      '/',
    '/login',
    new RegExp('^/auth/oauth-callback$'),
    new RegExp('^/docs($|/)'),
  ];
  
  // Define feature flag protections
  const featureFlagProtections = [    
    {
      flag: 'beta-feature',
      paths: ['/beta/*'],
      redirectTo: '/',
    }
  ];

  function onBootstrapComplete() {    
    loading = false;    
  }
  
</script>
  <NblocksBootStrap publicRoutes={PUBLIC_ROUTES} featureFlagProtections={featureFlagProtections} onBootstrapComplete={onBootstrapComplete} />

  {#if !loading}
  <Navbar />
  <main>
    <slot />
  </main>
  {/if}

