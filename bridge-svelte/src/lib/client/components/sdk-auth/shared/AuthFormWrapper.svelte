<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** Heading text. Pass `null` or `''` to render no heading. */
    heading?: string | null;
    headingSnippet?: Snippet;
    /**
     * Step description, the `<p class="bridge-step-desc">` under the heading.
     * Pass `null` or `''` to render nothing at all — no empty paragraph holding
     * vertical space (TBP-631).
     *
     * Independent of `heading`: suppressing one never affects the other. An app
     * that writes its own page title and subtitle suppresses both; an app that
     * writes only the title suppresses only the heading.
     *
     * Before TBP-631 these lived in each component's markup, outside this
     * wrapper's heading guard, so `heading={null}` could not reach them and a
     * host page ended up printing its own subtitle followed by Bridge's — the
     * same sentence twice, in two voices.
     */
    description?: string | null;
    /**
     * Description as a snippet, for copy that carries markup — `SignupForm`
     * needs `<strong>{email}</strong>` inside its sentence, which a plain
     * string prop cannot express. Takes precedence over `description`, mirroring
     * how `headingSnippet` relates to `heading`.
     */
    descriptionSnippet?: Snippet;
    children?: Snippet;
  }

  let {
    heading,
    headingSnippet,
    description,
    descriptionSnippet,
    children,
    class: className,
    style,
    ...rest
  }: Props = $props();
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
  {#if children}
    {@render children()}
  {/if}
</div>
