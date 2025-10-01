<script lang="ts">  
  import Navbar from '$lib/components/Navbar.svelte';
  import BridgeBootstrap from '@bridge-svelte/lib/client/BridgeBootstrap.svelte';
  import '../app.css';
  let { children } = $props();  
</script>
  <BridgeBootstrap></BridgeBootstrap>
  <Navbar />
  <main>
    {@render children()}
  </main>


