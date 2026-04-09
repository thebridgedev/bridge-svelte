<script lang="ts">
  import type { TeamUser } from '@thebridge/auth-core';
  import type { Snippet } from 'svelte';
  import type { HTMLDialogAttributes } from 'svelte/elements';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';
  import Alert from '../sdk-auth/shared/Alert.svelte';

  interface Props extends HTMLDialogAttributes {
    open?: boolean;
    onclose?: () => void;
    onadded?: (users: TeamUser[]) => void;
    titleSnippet?: Snippet;
    actions?: Snippet<[{ loading: boolean; onconfirm?: () => void; oncancel?: () => void }]>;
  }

  let {
    open = false,
    onclose,
    onadded,
    titleSnippet,
    actions,
    class: className,
    style,
    ...rest
  }: Props = $props();

  let dialogEl: HTMLDialogElement | undefined = $state();
  let emailsText = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) {
      emailsText = '';
      error = null;
      dialogEl.showModal();
    } else if (!open && dialogEl.open) {
      dialogEl.close();
    }
  });

  async function handleSubmit() {
    const emails = emailsText
      .split(/[,\n]/)
      .map((e) => e.trim())
      .filter(Boolean);

    if (emails.length === 0) {
      error = 'Please enter at least one email address.';
      return;
    }

    loading = true;
    error = null;
    try {
      const bridge = getBridgeAuth();
      const created = await bridge.team.createUsers(emails);
      onadded?.(created);
      onclose?.();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to add users';
    } finally {
      loading = false;
    }
  }
</script>

<dialog
  bind:this={dialogEl}
  class={className}
  {style}
  data-bridge-team-dialog
  onclose={() => onclose?.()}
  {...rest}
>
  <div class="bridge-team-dialog-content">
    {#if titleSnippet}
      {@render titleSnippet()}
    {:else}
      <h3 class="bridge-team-dialog-title">Add Team Members</h3>
      <p class="bridge-team-dialog-subtitle">
        Enter email addresses separated by commas or new lines.
      </p>
    {/if}

    {#if error}
      <div class="bridge-team-dialog-error">
        <Alert variant="error">{error}</Alert>
      </div>
    {/if}

    <div class="bridge-team-form-group">
      <label for="bridge-add-emails">Email addresses</label>
      <textarea
        id="bridge-add-emails"
        bind:value={emailsText}
        placeholder="user1@example.com&#10;user2@example.com"
        rows="4"
        disabled={loading}
      ></textarea>
    </div>

    {#if actions}
      {@render actions({ loading, onconfirm: handleSubmit, oncancel: onclose })}
    {:else}
      <div class="bridge-team-dialog-actions">
        <button
          class="bridge-btn bridge-btn-secondary"
          onclick={() => onclose?.()}
          disabled={loading}
        >
          Cancel
        </button>
        <button
          class="bridge-btn bridge-btn-primary"
          onclick={handleSubmit}
          disabled={loading || !emailsText.trim()}
        >
          {loading ? 'Adding...' : 'Add Members'}
        </button>
      </div>
    {/if}
  </div>
</dialog>
