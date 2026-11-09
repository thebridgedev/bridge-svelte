<!--
  Changes a member's role, or turns their access off and on. The roles listed
  are the ones the editor may give. Bridge decides; a refusal shows here.
-->
<script lang="ts">
  import type { Member, MemberUpdate, Role } from '@nebulr-group/bridge-auth-core';
  import { untrack, type Snippet } from 'svelte';
  import type { HTMLDialogAttributes } from 'svelte/elements';
  import { getBridge } from '../../core/client.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import Alert from '../shared/Alert.svelte';

  interface Props extends Omit<HTMLDialogAttributes, 'open' | 'onclose'> {
    open?: boolean;
    member?: Member | null;
    onclose?: () => void;
    onupdated?: (member: Member) => void;
    titleSnippet?: Snippet;
    actions?: Snippet<[{ loading: boolean; onconfirm?: () => void; oncancel?: () => void }]>;
  }

  let {
    open = false,
    member = null,
    onclose,
    onupdated,
    titleSnippet,
    actions,
    class: className,
    style,
    ...rest
  }: Props = $props();

  const t = translator();

  let dialogEl: HTMLDialogElement | undefined = $state();
  let role = $state('');
  let enabled = $state(true);
  let roles = $state<Role[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  // A member whose access is off reads as disabled or suspended.
  const isOff = (m: Member) => m.status === 'disabled' || m.status === 'suspended';

  // Keep the member's current role selectable even when the editor may not give it.
  const options = $derived.by(() => {
    const list = roles.map((r) => ({ key: r.key, name: r.name }));
    const current = member?.role;
    if (current && !list.some((r) => r.key === current)) list.unshift({ key: current, name: current });
    return list;
  });

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
    role = member?.role ?? '';
    enabled = member ? !isOff(member) : true;
    roles = [];
    error = null;
    void loadRoles();
  }

  async function loadRoles() {
    try {
      roles = await getBridge().team.roles.list({ assignable: true });
    } catch (err) {
      error = errorMessage(err, t);
    }
  }

  async function submit() {
    if (!member) return;
    const fields: MemberUpdate = {
      ...(role && role !== member.role ? { role } : {}),
      ...(enabled === isOff(member) ? { enabled } : {}),
    };
    if (Object.keys(fields).length === 0) {
      onclose?.();
      return;
    }
    loading = true;
    error = null;
    try {
      const updated = await getBridge().team.members.update(member.id, fields);
      onupdated?.(updated);
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
      <h3 class="bridge-team-dialog-title">Edit Member</h3>
      {#if member}
        <p class="bridge-team-dialog-subtitle">{member.user.email}</p>
      {/if}
    {/if}

    {#if error}
      <div class="bridge-team-dialog-error">
        <Alert variant="error">{error}</Alert>
      </div>
    {/if}

    <div class="bridge-team-form-group">
      <label for="bridge-edit-role">Role</label>
      <select id="bridge-edit-role" bind:value={role} disabled={loading}>
        {#each options as r (r.key)}
          <option value={r.key}>{r.name}</option>
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
      {@render actions({ loading, onconfirm: submit, oncancel: onclose })}
    {:else}
      <div class="bridge-team-dialog-actions">
        <button type="button" class="bridge-btn bridge-btn-secondary" onclick={() => onclose?.()} disabled={loading}>
          Cancel
        </button>
        <button type="button" class="bridge-btn bridge-btn-primary" onclick={submit} disabled={loading}>
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    {/if}
  </div>
</dialog>
