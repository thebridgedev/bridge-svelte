<script lang="ts">
  import type { TeamUser } from '@thebridge/auth-core';
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';
  import Alert from '../sdk-auth/shared/Alert.svelte';
  import Spinner from '../sdk-auth/shared/Spinner.svelte';
  import TeamAddUserDialog from './TeamAddUserDialog.svelte';
  import TeamConfirmDialog from './TeamConfirmDialog.svelte';
  import TeamEditUserDialog from './TeamEditUserDialog.svelte';
  import TeamUserActionsMenu from './TeamUserActionsMenu.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    onError?: (error: Error) => void;
  }

  let {
    onError,
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
  }

  function handleUserUpdated(updated: TeamUser) {
    users = users.map((u) => (u.id === updated.id ? updated : u));
  }

  async function handleDeleteConfirm() {
    if (!deletingUser) return;
    actionLoading = true;
    try {
      const bridge = getBridgeAuth();
      await bridge.team.deleteUser(deletingUser.id);
      users = users.filter((u) => u.id !== deletingUser!.id);
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

<div class={className} {style} data-bridge-team-users {...rest}>
  <div class="bridge-team-users-header">
    <h3 class="bridge-team-users-title">Team Members</h3>
    <button class="bridge-btn bridge-btn-primary" onclick={() => (showAddDialog = true)}>
      Add Member
    </button>
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
      <button class="bridge-btn bridge-btn-primary" onclick={() => (showAddDialog = true)}>
        Add your first team member
      </button>
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
