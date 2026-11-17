<script lang="ts">
  import Entitled from './Entitled.svelte';

  let { to }: { to: string } = $props();
</script>

<Entitled {to}>
  <p id="yes">yes</p>
  {#snippet fallback()}<p id="no">no</p>{/snippet}
  {#snippet loading()}<p id="wait">wait</p>{/snippet}
</Entitled>
