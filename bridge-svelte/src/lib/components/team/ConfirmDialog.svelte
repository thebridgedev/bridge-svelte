<!--
  A yes-or-no dialog for a team action, such as removing a member. `detail`
  adds a line under the message (what else goes with it); `error` shows a
  refusal without closing the dialog.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLDialogAttributes } from 'svelte/elements';
  import Alert from '../shared/Alert.svelte';

  interface Props extends Omit<HTMLDialogAttributes, 'open' | 'title'> {
    open?: boolean;
    title?: string;
    message?: string;
    detail?: string | null;
    error?: string | null;
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
    detail = null,
    error = null,
    confirmLabel = 'Confirm',
    variant = 'danger',
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

    {#if detail}
      <p class="bridge-team-dialog-message" data-bridge-team-dialog-detail>{detail}</p>
    {/if}

    {#if error}
      <div class="bridge-team-dialog-error">
        <Alert variant="error">{error}</Alert>
      </div>
    {/if}

    {#if actions}
      {@render actions({ loading, onconfirm, oncancel })}
    {:else}
      <div class="bridge-team-dialog-actions">
        <button type="button" class="bridge-btn bridge-btn-secondary" onclick={() => oncancel?.()} disabled={loading}>
          Cancel
        </button>
        <button
          type="button"
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
