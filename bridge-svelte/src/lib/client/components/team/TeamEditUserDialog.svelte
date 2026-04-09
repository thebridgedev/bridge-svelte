<script lang="ts">
  import type { TeamUser } from '@thebridge/auth-core';
  import type { Snippet } from 'svelte';
  import type { HTMLDialogAttributes } from 'svelte/elements';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';
  import Alert from '../sdk-auth/shared/Alert.svelte';

  interface Props extends HTMLDialogAttributes {
    open?: boolean;
    user?: TeamUser | null;
    roles?: string[];
    onclose?: () => void;
    onupdated?: (user: TeamUser) => void;
    titleSnippet?: Snippet;
    actions?: Snippet<[{ loading: boolean; onconfirm?: () => void; oncancel?: () => void }]>;
  }

  let {
    open = false,
    user = null as TeamUser | null,
    roles = [] as string[],
    onclose,
    onupdated,
    titleSnippet,
    actions,
    class: className,
    style,
    ...rest
  }: Props = $props();

  let dialogEl: HTMLDialogElement | undefined = $state();
  let selectedRole = $state('');
  let enabled = $state(true);
  let loading = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) {
      selectedRole = user?.role ?? '';
      enabled = user?.enabled ?? true;
      error = null;
      dialogEl.showModal();
    } else if (!open && dialogEl.open) {
      dialogEl.close();
    }
  });

  async function handleSubmit() {
    if (!user) return;
    loading = true;
    error = null;
    try {
      const bridge = getBridgeAuth();
      const updated = await bridge.team.updateUser({
        id: user.id,
        role: selectedRole || undefined,
        enabled,
      });
      onupdated?.(updated);
      onclose?.();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to update user';
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
      <h3 class="bridge-team-dialog-title">Edit User</h3>
      {#if user}
        <p class="bridge-team-dialog-subtitle">{user.email}</p>
      {/if}
    {/if}

    {#if error}
      <div class="bridge-team-dialog-error">
        <Alert variant="error">{error}</Alert>
      </div>
    {/if}

    <div class="bridge-team-form-group">
      <label for="bridge-edit-role">Role</label>
      <select id="bridge-edit-role" bind:value={selectedRole} disabled={loading}>
        {#each roles as role}
          <option value={role}>{role}</option>
        {/each}
      </select>
    </div>

    <div class="bridge-team-form-group">
      <label class="bridge-team-checkbox-label">
        <input type="checkbox" bind:checked={enabled} disabled={loading} />
        <span>Enabled</span>
      </label>
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
          disabled={loading}
        >
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    {/if}
  </div>
</dialog>
