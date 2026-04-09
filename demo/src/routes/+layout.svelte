<script lang="ts">
  import Navbar from '$lib/components/Navbar.svelte';
  import BridgeBootstrap from '@bridge-svelte/lib/client/BridgeBootstrap.svelte';
  import { stylesToggle } from '$lib/styles-toggle.svelte.js';
  import bridgeStylesContent from '@bridge-svelte/lib/styles.css?inline';
  import '../app.css';

  let { children } = $props();

  $effect(() => {
    const el = document.getElementById('bridge-demo-styles');
    if (stylesToggle.enabled) {
      if (!el) {
        const style = document.createElement('style');
        style.id = 'bridge-demo-styles';
        style.textContent = bridgeStylesContent;
        document.head.appendChild(style);
      }
    } else {
      el?.remove();
    }
  });
</script>

<BridgeBootstrap></BridgeBootstrap>
<Navbar />
<main>
  {@render children()}
</main>
