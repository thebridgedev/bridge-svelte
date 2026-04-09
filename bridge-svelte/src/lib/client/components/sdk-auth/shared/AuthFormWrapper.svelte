<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    heading?: string;
    headingSnippet?: Snippet;
    children?: Snippet;
  }

  let { heading, headingSnippet, children, class: className, style, ...rest }: Props = $props();
</script>

<div class={className} {style} data-bridge-auth-form {...rest}>
  {#if headingSnippet}
    {@render headingSnippet()}
  {:else if heading}
    <h2 class="bridge-auth-heading">{heading}</h2>
  {/if}
  {#if children}
    {@render children()}
  {/if}
</div>
