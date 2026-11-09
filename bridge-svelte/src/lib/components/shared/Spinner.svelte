<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  interface Props extends HTMLAttributes<HTMLSpanElement> {
    size?: number;
  }

  let { size = 24, class: className, style, ...rest }: Props = $props();
</script>

<span
  class={className}
  style="width: {size}px; height: {size}px;{style ? ' ' + style : ''}"
  data-bridge-spinner
  {...rest}
></span>
