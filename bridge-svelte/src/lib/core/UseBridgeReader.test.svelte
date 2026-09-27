<!-- Test fixture (TBP-697): renders which bridge surface useBridge() returned. -->
<script lang="ts">
  import { useBridge } from './use-bridge.js';

  const surface = useBridge() as unknown as { __label?: string };
</script>

<span data-surface={surface.__label ?? 'singleton'}></span>
