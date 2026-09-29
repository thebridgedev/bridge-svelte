<script lang="ts">
  import type { TeamUser } from '@nebulr-group/bridge-auth-core';
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';
  import Alert from '../sdk-auth/shared/Alert.svelte';
  import Spinner from '../sdk-auth/shared/Spinner.svelte';
  import TeamAddUserDialog from './TeamAddUserDialog.svelte';
  import TeamConfirmDialog from './TeamConfirmDialog.svelte';
  import TeamEditUserDialog from './TeamEditUserDialog.svelte';
  import TeamUserActionsMenu from './TeamUserActionsMenu.svelte';
  import QuotaGate from '../subscription/QuotaGate.svelte';
  import { useQuota, type QuotaState } from '../../../core/use-quota.js';
  import { billingRoutes } from '../../billing-routes.js';
  import { seatsChanged } from './seats.js';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    onError?: (error: Error) => void;
    /**
     * TBP-763 — the plan limit that counts seats (e.g. `'seats'`). With it,
     * Invite is wrapped in <QuotaGate> and stops at the plan's limit; an
     * invite, removal or enable/disable re-reads the seat count.
     */
    seatsMetric?: string;
  }

  let {
    onError,
    seatsMetric,
    class: className,
    style,
    ...rest
  }: Props = $props();

  let users = $state<TeamUser[]>([]);
  let roles = $state<string[]>([]);
  let mfaEnabled = $state(false);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Dialog states
  let showAddDialog = $state(false);
  let showEditDialog = $state(false);
  let editingUser = $state<TeamUser | null>(null);
  let showDeleteConfirm = $state(false);
  let showResetConfirm = $state(false);
  let deletingUser = $state<TeamUser | null>(null);
  let resettingUser = $state<TeamUser | null>(null);
  let actionLoading = $state(false);

  // TBP-763 — the seat count, only when the page counts seats (no read otherwise).
  // svelte-ignore state_referenced_locally
  const seatsQuota: QuotaState | null = seatsMetric ? useQuota(() => seatsMetric ?? '') : null;
  // Unknown (loading, no limit on the plan) or metered (bills extra seats): no cap here.
  const seatsLeft = $derived(
    seatsQuota && !seatsQuota.loading && !seatsQuota.unlimited && seatsQuota.snapshot?.policy !== 'metered'
      ? seatsQuota.remaining
      : null,
  );

  onMount(() => {
    loadData();
  });

  async function loadData() {
    loading = true;
    error = null;
    try {
      const bridge = getBridgeAuth();
      const [userResult, rolesResult] = await Promise.all([
        bridge.team.listUsers(),
        bridge.team.listUserRoles(),
      ]);
      users = userResult.users;
      mfaEnabled = userResult.mfaEnabled;
      roles = rolesResult;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to load users');
      error = e.message;
      onError?.(e);
    } finally {
      loading = false;
    }
  }

  function openEdit(user: TeamUser) {
    editingUser = user;
    showEditDialog = true;
  }

  function openDelete(user: TeamUser) {
    deletingUser = user;
    showDeleteConfirm = true;
  }

  function openResetPassword(user: TeamUser) {
    resettingUser = user;
    showResetConfirm = true;
  }

  function handleUsersAdded(added: TeamUser[]) {
    users = [...users, ...added];
    seatsChanged(seatsMetric);
  }

  function handleUserUpdated(updated: TeamUser) {
    users = users.map((u) => (u.id === updated.id ? updated : u));
    // Enabling or disabling someone moves the seat count.
    seatsChanged(seatsMetric);
  }

  async function handleDeleteConfirm() {
    if (!deletingUser) return;
    actionLoading = true;
    try {
      const bridge = getBridgeAuth();
      await bridge.team.deleteUser(deletingUser.id);
      users = users.filter((u) => u.id !== deletingUser!.id);
      seatsChanged(seatsMetric);
      showDeleteConfirm = false;
      deletingUser = null;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to delete user');
      onError?.(e);
    } finally {
      actionLoading = false;
    }
  }

  async function handleResetConfirm() {
    if (!resettingUser) return;
    actionLoading = true;
    try {
      const bridge = getBridgeAuth();
      await bridge.team.sendPasswordResetLink(resettingUser.id);
      showResetConfirm = false;
      resettingUser = null;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to send reset link');
      onError?.(e);
    } finally {
      actionLoading = false;
    }
  }
</script>

{#snippet seatsAtLimit(quota: QuotaState)}
  All {quota.limit?.toLocaleString()} seats on your plan are taken (pending invites count).
  <a href={billingRoutes().manageRoute}>Upgrade</a> to invite more people.
{/snippet}

{#snippet inviteButton(label: string)}
  {#if seatsMetric}
    <QuotaGate metric={seatsMetric} atLimit={seatsAtLimit}>
      <button class="bridge-btn bridge-btn-primary" onclick={() => (showAddDialog = true)}>
        {label}
      </button>
    </QuotaGate>
  {:else}
    <button class="bridge-btn bridge-btn-primary" onclick={() => (showAddDialog = true)}>
      {label}
    </button>
  {/if}
{/snippet}

<div class={className} {style} data-bridge-team-users {...rest}>
  <div class="bridge-team-users-header">
    <h3 class="bridge-team-users-title">Team Members</h3>
    {@render inviteButton('Add Member')}
  </div>

  {#if loading}
    <div class="bridge-team-loading">
      <Spinner size={32} />
      <span>Loading team members...</span>
    </div>
  {:else if error}
    <Alert variant="error">{error}</Alert>
  {:else if users.length === 0}
    <div class="bridge-team-empty">
      <p>No team members yet.</p>
      {@render inviteButton('Add your first team member')}
    </div>
  {:else}
    <div class="bridge-team-table-wrapper">
      <table class="bridge-team-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each users as user (user.id)}
            <tr>
              <td>
                <div class="bridge-team-user-cell">
                  <div class="bridge-team-user-name">
                    {user.fullName || user.username || user.email}
                  </div>
                  <div class="bridge-team-user-email">{user.email}</div>
                </div>
              </td>
              <td>
                <span class="bridge-team-badge">{user.role ?? '—'}</span>
              </td>
              <td>
                <span
                  class="bridge-team-status"
                  data-state={user.enabled ? 'active' : 'disabled'}
                >
                  {user.enabled ? 'Active' : 'Disabled'}
                </span>
              </td>
              <td class="bridge-team-actions-cell">
                <TeamUserActionsMenu
                  onedit={() => openEdit(user)}
                  onresetpassword={() => openResetPassword(user)}
                  ondelete={() => openDelete(user)}
                />
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<TeamAddUserDialog
  open={showAddDialog}
  onclose={() => (showAddDialog = false)}
  onadded={handleUsersAdded}
  {seatsLeft}
/>

<TeamEditUserDialog
  open={showEditDialog}
  user={editingUser}
  {roles}
  onclose={() => { showEditDialog = false; editingUser = null; }}
  onupdated={handleUserUpdated}
/>

<TeamConfirmDialog
  open={showDeleteConfirm}
  title="Delete User"
  message="Are you sure you want to delete {deletingUser?.email ?? 'this user'}? This action cannot be undone."
  confirmLabel="Delete"
  variant="danger"
  loading={actionLoading}
  onconfirm={handleDeleteConfirm}
  oncancel={() => { showDeleteConfirm = false; deletingUser = null; }}
/>

<TeamConfirmDialog
  open={showResetConfirm}
  title="Reset Password"
  message="Send a password reset link to {resettingUser?.email ?? 'this user'}?"
  confirmLabel="Send Reset Link"
  variant="default"
  loading={actionLoading}
  onconfirm={handleResetConfirm}
  oncancel={() => { showResetConfirm = false; resettingUser = null; }}
/>
