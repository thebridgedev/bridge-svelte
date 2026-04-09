<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLDialogAttributes } from 'svelte/elements';

  interface Props extends HTMLDialogAttributes {
    open?: boolean;
    title?: string;
    message?: string;
    confirmLabel?: string;
    variant?: 'danger' | 'default';
    loading?: boolean;
    onconfirm?: () => void;
    oncancel?: () => void;
    titleSnippet?: Snippet;
    actions?: Snippet<[{ loading: boolean; onconfirm?: () => void; oncancel?: () => void }]>;
  }

  let {
    open = false,
    title = 'Confirm',
    message = 'Are you sure?',
    confirmLabel = 'Confirm',
    variant = 'danger' as 'danger' | 'default',
    loading = false,
    onconfirm,
    oncancel,
    titleSnippet,
    actions,
    class: className,
    style,
    ...rest
  }: Props = $props();

  let dialogEl: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) dialogEl.showModal();
    else if (!open && dialogEl.open) dialogEl.close();
  });
</script>

<dialog
  bind:this={dialogEl}
  class={className}
  {style}
  data-bridge-team-dialog
  data-variant={variant}
  onclose={() => oncancel?.()}
  {...rest}
>
  <div class="bridge-team-dialog-content">
    {#if titleSnippet}
      {@render titleSnippet()}
    {:else}
      <h3 class="bridge-team-dialog-title">{title}</h3>
      <p class="bridge-team-dialog-message">{message}</p>
    {/if}
    {#if actions}
      {@render actions({ loading, onconfirm, oncancel })}
    {:else}
      <div class="bridge-team-dialog-actions">
        <button
          class="bridge-btn bridge-btn-secondary"
          onclick={() => oncancel?.()}
          disabled={loading}
        >
          Cancel
        </button>
        <button
          class="bridge-btn {variant === 'danger' ? 'bridge-btn-danger' : 'bridge-btn-primary'}"
          onclick={() => onconfirm?.()}
          disabled={loading}
        >
          {loading ? 'Processing...' : confirmLabel}
        </button>
      </div>
    {/if}
  </div>
</dialog>
