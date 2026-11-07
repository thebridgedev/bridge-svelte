<!--
  A small badge with the Live connection's status, for development builds:
  `open` (live), `polling` (no socket; checking every few seconds),
  `connecting`, `closed` or `off`.
-->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { liveStatus } from '../../core/stores.js';

  let { class: className, style, ...rest }: HTMLAttributes<HTMLSpanElement> = $props();

  const LABELS: Record<string, string> = {
    open: 'Live',
    polling: 'Live (polling)',
    connecting: 'Connecting…',
    closed: 'Live closed',
    off: 'Live off',
  };
</script>

<span class={className} {style} data-bridge-live-status={$liveStatus} role="status" {...rest}>
  {LABELS[$liveStatus] ?? $liveStatus}
</span>
