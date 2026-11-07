<!--
  The workspace's pending invites. Someone who may manage the team (the
  `teamManage` flag) can send one again (the old link stops working) or
  revoke it. The list fetches again on Live notices about accounts.
-->
<script lang="ts">
  import type { Invite } from '@nebulr-group/bridge-auth-core';
  import type { HTMLAttributes } from 'svelte/elements';
  import { getBridge } from '../../core/client.js';
  import { canManageTeam } from '../../core/flags.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import { resource } from '../../core/stores.js';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    onError?: (error: unknown) => void;
  }

  let { onError, class: className, style, ...rest }: Props = $props();

  // Accepted, revoked and expired invites are history, not pending.
  const DONE = new Set(['accepted', 'revoked', 'expired']);

  const t = translator();
  const canManage = canManageTeam();
  const invites = resource((client) => client.team.invites.list(), ['accounts.']);

  const pending = $derived(($invites.value ?? []).filter((invite) => !DONE.has(invite.state)));
  const loadingList = $derived($invites.value === null && $invites.error === null);

  let busyId = $state<string | null>(null);
  let failure = $state<string | null>(null);
  let notice = $state<string | null>(null);

  async function act(invite: Invite, run: () => Promise<unknown>, done: string) {
    busyId = invite.id;
    failure = null;
    notice = null;
    try {
      await run();
      notice = done;
      await invites.refresh();
    } catch (error) {
      failure = errorMessage(error, t);
      onError?.(error);
    } finally {
      busyId = null;
    }
  }

  function resend(invite: Invite) {
    const fields = invite.role ? { email: invite.email, role: invite.role } : { email: invite.email };
    void act(invite, () => getBridge().team.invites.create(fields), `Invite sent again to ${invite.email}.`);
  }

  function revoke(invite: Invite) {
    void act(invite, () => getBridge().team.invites.revoke(invite.id), `Invite to ${invite.email} revoked.`);
  }

  function day(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
  }
</script>

<div class={className} {style} data-bridge-team-invites data-loading={$invites.loading} {...rest}>
  <div class="bridge-team-users-header">
    <h3 class="bridge-team-users-title">Pending Invites</h3>
  </div>

  {#if failure}
    <div class="bridge-team-alert"><Alert variant="error">{failure}</Alert></div>
  {:else if $invites.error}
    <div class="bridge-team-alert"><Alert variant="error">{errorMessage($invites.error, t)}</Alert></div>
  {/if}
  {#if notice}
    <div class="bridge-team-alert"><Alert variant="success">{notice}</Alert></div>
  {/if}

  {#if loadingList}
    <div class="bridge-team-loading">
      <Spinner size={32} />
      <span>Loading invites...</span>
    </div>
  {:else if $invites.value !== null && pending.length === 0}
    <div class="bridge-team-empty">
      <p>No pending invites.</p>
    </div>
  {:else if pending.length > 0}
    <div class="bridge-team-table-wrapper">
      <table class="bridge-team-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Expires</th>
            {#if $canManage}<th></th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each pending as invite (invite.id)}
            {@const busy = busyId === invite.id}
            <tr data-invite-id={invite.id} data-state={invite.state} data-loading={busy}>
              <td><span class="bridge-team-user-email">{invite.email}</span></td>
              <td><span class="bridge-team-badge">{invite.role || '—'}</span></td>
              <td>{day(invite.expiresAt)}</td>
              {#if $canManage}
                <td class="bridge-team-actions-cell">
                  <div class="bridge-team-actions" data-bridge-team-actions>
                    <button type="button" class="bridge-btn bridge-btn-secondary" disabled={busyId !== null} onclick={() => resend(invite)}>
                      Resend
                    </button>
                    <button
                      type="button"
                      class="bridge-btn-danger-sm"
                      data-variant="danger"
                      disabled={busyId !== null}
                      onclick={() => revoke(invite)}
                    >
                      Revoke
                    </button>
                  </div>
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
