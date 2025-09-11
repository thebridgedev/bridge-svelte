<script lang="ts">  
  import Navbar from '$lib/components/Navbar.svelte';
  import NblocksBootStrap from '@nblocks-svelte/lib/client/NblocksBootStrap.svelte';
  import '../app.css';
  let { children } = $props();  
</script>
  <NblocksBootStrap></NblocksBootStrap>
  <Navbar />
  <main>
    {@render children()}
  </main>


