<script lang="ts">
  import Navbar from '$lib/components/Navbar.svelte';
  import '../app.css';
</script>

<Navbar />

<main>
  <slot />
</main>

<style>
  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }
</style> 