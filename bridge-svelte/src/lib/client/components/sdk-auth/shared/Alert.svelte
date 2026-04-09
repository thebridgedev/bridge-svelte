<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    variant?: 'error' | 'info' | 'success';
    children?: Snippet;
  }

  let { variant = 'error', children, class: className, style, ...rest }: Props = $props();
</script>

{#if children}
  <div class={className} {style} data-variant={variant} data-bridge-alert role="alert" {...rest}>
    {@render children()}
  </div>
{/if}
