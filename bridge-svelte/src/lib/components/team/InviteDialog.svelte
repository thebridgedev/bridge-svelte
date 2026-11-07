<!--
  Invites one person by email, with a role the inviter may give. Inviting an
  address that already has an invite sends a new one; the old link stops
  working. Bridge enforces any limit; a refusal shows its message here.
-->
<script lang="ts">
  import type { Invite, Role } from '@nebulr-group/bridge-auth-core';
  import { untrack, type Snippet } from 'svelte';
  import type { HTMLDialogAttributes } from 'svelte/elements';
  import { getBridge } from '../../core/client.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import Alert from '../shared/Alert.svelte';

  interface Props extends Omit<HTMLDialogAttributes, 'open' | 'onclose'> {
    open?: boolean;
    onclose?: () => void;
    oninvited?: (invite: Invite) => void;
    titleSnippet?: Snippet;
    actions?: Snippet<[{ loading: boolean; onconfirm?: () => void; oncancel?: () => void }]>;
  }

  let { open = false, onclose, oninvited, titleSnippet, actions, class: className, style, ...rest }: Props = $props();

  const t = translator();

  let dialogEl: HTMLDialogElement | undefined = $state();
  let email = $state('');
  let role = $state('');
  let roles = $state<Role[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  const hasDefault = $derived(roles.some((r) => r.isDefault));

  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) {
      untrack(reset);
      dialogEl.showModal();
    } else if (!open && dialogEl.open) {
      dialogEl.close();
    }
  });

  function reset() {
    email = '';
    role = '';
    roles = [];
    error = null;
    void loadRoles();
  }

  async function loadRoles() {
    try {
      roles = await getBridge().team.roles.list({ assignable: true });
      role = roles.find((r) => r.isDefault)?.key ?? '';
    } catch (err) {
      error = errorMessage(err, t);
    }
  }

  async function submit() {
    const address = email.trim();
    if (address === '') {
      error = 'Please enter an email address.';
      return;
    }
    loading = true;
    error = null;
    try {
      const invite = await getBridge().team.invites.create(role ? { email: address, role } : { email: address });
      oninvited?.(invite);
      onclose?.();
    } catch (err) {
      error = errorMessage(err, t);
    } finally {
      loading = false;
    }
  }
</script>

<dialog bind:this={dialogEl} class={className} {style} data-bridge-team-dialog onclose={() => onclose?.()} {...rest}>
  <div class="bridge-team-dialog-content">
    {#if titleSnippet}
      {@render titleSnippet()}
    {:else}
      <h3 class="bridge-team-dialog-title">Add Team Member</h3>
      <p class="bridge-team-dialog-subtitle">They get an email with a link to join.</p>
    {/if}

    {#if error}
      <div class="bridge-team-dialog-error">
        <Alert variant="error">{error}</Alert>
      </div>
    {/if}

    <form
      onsubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div class="bridge-team-form-group">
        <label for="bridge-add-emails">Email address</label>
        <input
          id="bridge-add-emails"
          type="email"
          autocomplete="off"
          placeholder="name@example.com"
          bind:value={email}
          disabled={loading}
        />
      </div>

      {#if roles.length > 0}
        <div class="bridge-team-form-group">
          <label for="bridge-invite-role">Role</label>
          <select id="bridge-invite-role" bind:value={role} disabled={loading}>
            {#if !hasDefault}
              <option value="">Default role</option>
            {/if}
            {#each roles as r (r.key)}
              <option value={r.key}>{r.name}</option>
            {/each}
          </select>
        </div>
      {/if}
    </form>

    {#if actions}
      {@render actions({ loading, onconfirm: submit, oncancel: onclose })}
    {:else}
      <div class="bridge-team-dialog-actions">
        <button type="button" class="bridge-btn bridge-btn-secondary" onclick={() => onclose?.()} disabled={loading}>
          Cancel
        </button>
        <button type="button" class="bridge-btn bridge-btn-primary" onclick={submit} disabled={loading || !email.trim()}>
          {loading ? 'Sending...' : 'Send Invite'}
        </button>
      </div>
    {/if}
  </div>
</dialog>
