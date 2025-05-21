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
  

  
</script>
<NblocksBootStrap publicRoutes={PUBLIC_ROUTES} />

  <Navbar />
  <main>
    <slot />
  </main>

