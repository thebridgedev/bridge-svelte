<!--
  One message look in three kinds (TBP-532): error, success and info. A calm surface drawn from the page's own
  background, a thin accent bar and an icon in the kind's colour, and the text in the page's own text colour, so it
  reads in light and dark themes alike and never shouts. An error is announced at once (role="alert"); a success or an
  info is announced politely (role="status"), so a screen reader does not interrupt for good news.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    variant?: 'error' | 'info' | 'success';
    children?: Snippet;
  }

  let { variant = 'error', children, class: className, style, ...rest }: Props = $props();
  const role = $derived(variant === 'error' ? 'alert' : 'status');
</script>

{#if children}
  <div class={className} {style} data-variant={variant} data-bridge-alert {role} aria-live={variant === 'error' ? 'assertive' : 'polite'} {...rest}>
    <svg class="bridge-alert-icon" data-bridge-alert-icon viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
      {#if variant === 'success'}
        <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" stroke-width="1.5" />
        <path d="M6.5 10.25l2.25 2.25 4.75-5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
      {:else if variant === 'info'}
        <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" stroke-width="1.5" />
        <path d="M10 9v5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
        <circle cx="10" cy="6.25" r="1.1" fill="currentColor" />
      {:else}
        <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" stroke-width="1.5" />
        <path d="M10 5.75v5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
        <circle cx="10" cy="13.75" r="1.1" fill="currentColor" />
      {/if}
    </svg>
    <div class="bridge-alert-text" data-bridge-alert-text>{@render children()}</div>
  </div>
{/if}
