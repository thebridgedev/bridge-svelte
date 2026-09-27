<!-- Test fixture (TBP-697): a parent that overrides the bridge surface for its children. -->
<script lang="ts">
  import type { BridgeSurface } from './bridge.js';
  import { setBridgeContext } from './use-bridge.js';
  import UseBridgeReader from './UseBridgeReader.test.svelte';

  interface Props {
    fixture: BridgeSurface;
  }
  const { fixture }: Props = $props();

  // svelte-ignore state_referenced_locally
  setBridgeContext(fixture);
</script>

<UseBridgeReader />
