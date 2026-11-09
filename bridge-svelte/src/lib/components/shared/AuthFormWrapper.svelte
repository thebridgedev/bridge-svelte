<!--
  The frame of every sign-in form: an optional heading and description, then
  the form. Pass `heading={null}` and `description={null}` when your page
  writes its own title; each is suppressed on its own.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** Heading text. `null` or `''` renders none. */
    heading?: string | null;
    headingSnippet?: Snippet;
    /** The line under the heading. `null` or `''` renders none. */
    description?: string | null;
    /** The line under the heading, with markup. Wins over `description`. */
    descriptionSnippet?: Snippet;
    children?: Snippet;
  }

  let { heading, headingSnippet, description, descriptionSnippet, children, class: className, style, ...rest }: Props = $props();
</script>

<div class={className} {style} data-bridge-auth-form {...rest}>
  {#if headingSnippet}
    {@render headingSnippet()}
  {:else if heading}
    <h2 class="bridge-auth-heading">{heading}</h2>
  {/if}
  {#if descriptionSnippet}
    {@render descriptionSnippet()}
  {:else if description}
    <p class="bridge-step-desc">{description}</p>
  {/if}
  {@render children?.()}
</div>
