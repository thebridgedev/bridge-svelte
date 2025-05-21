<script lang="ts">  
  import Navbar from '$lib/components/Navbar.svelte';
  import NblocksBootStrap from '@nblocks-svelte/client/NblocksBootStrap.svelte';
  import '../app.css';

  let loading = true;
  const PUBLIC_ROUTES = [
    '/',
    '/login',
    /^\/auth\/oauth-callback$/,
    /^\/docs($|\/)/
  ];
  
  // Define feature flag protections
  const featureFlagProtections = [    
    {
      flag: 'beta-feature',
      paths: ['/beta/*'],
      redirectTo: '/',
    }
  ];
  
</script>
  <NblocksBootStrap publicRoutes={PUBLIC_ROUTES} featureFlagProtections={featureFlagProtections} />

  <Navbar />
  <main>
    <slot />
  </main>

