<!--
  The workspace's members, with search. Someone who may manage the team (the
  `teamManage` flag) also gets Add Member and each row's actions: edit, enable
  or disable, and remove. Bridge decides every change; a refusal shows its
  message. The list fetches again on Live notices about accounts.
-->
<script lang="ts">
  import type { Member } from '@nebulr-group/bridge-auth-core';
  import { onDestroy } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { getBridge } from '../../core/client.js';
  import { canManageTeam } from '../../core/flags.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import { resource } from '../../core/stores.js';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import EditMemberDialog from './EditMemberDialog.svelte';
  import InviteDialog from './InviteDialog.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    onError?: (error: unknown) => void;
  }

  let { onError, class: className, style, ...rest }: Props = $props();

  const PAGE = 100;
  const MAX = 500;

  const t = translator();
  const canManage = canManageTeam();

  let search = $state('');
  let query = $state('');
  let limit = $state(PAGE);
  const list = resource((client) => client.team.members.list({ limit, search: query || undefined }), ['accounts.']);

  const members = $derived($list.value ?? []);
  const loadingList = $derived($list.value === null && $list.error === null);
  const hasMore = $derived(members.length >= limit && limit < MAX);

  let timer: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(timer));

  function onSearch() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      query = search.trim();
      void list.refresh();
    }, 250);
  }

  function showMore() {
    limit = Math.min(MAX, limit + PAGE);
    void list.refresh();
  }

  let openMenu = $state<string | null>(null);
  let busyId = $state<string | null>(null);
  let failure = $state<string | null>(null);
  let inviting = $state(false);
  let editing = $state<Member | null>(null);
  let removing = $state<Member | null>(null);
  let removeDetail = $state<string | null>(null);
  let removeError = $state<string | null>(null);
  let removeBusy = $state(false);

  const nameOf = (m: Member) =>
    [m.user.firstName, m.user.lastName].filter((part) => part && part.trim() !== '').join(' ') || m.user.email;

  // A member whose access is off reads as disabled or suspended.
  const isOff = (m: Member) => m.status === 'disabled' || m.status === 'suspended';

  function statusLabel(m: Member): string {
    if (isOff(m)) return 'Disabled';
    const words = m.status.replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  /** The counts in a deletion preview as one line, or null when it has none. */
  function previewLine(preview: unknown): string | null {
    if (preview === null || typeof preview !== 'object') return null;
    const p = preview as Record<string, unknown>;
    const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object';
    const source = [p['affects'], p['counts']].find(isObject) ?? p;
    const parts = Object.entries(source)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0)
      .map(([key, n]) => `${n.toLocaleString()} ${key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase()}`);
    return parts.length > 0 ? `This also removes ${parts.join(', ')}.` : null;
  }

  function fail(error: unknown): string {
    onError?.(error);
    return errorMessage(error, t);
  }

  function toggleMenu(event: MouseEvent, id: string) {
    event.stopPropagation();
    openMenu = openMenu === id ? null : id;
  }

  function openEdit(member: Member) {
    openMenu = null;
    editing = member;
  }

  async function setEnabled(member: Member, enabled: boolean) {
    openMenu = null;
    failure = null;
    busyId = member.id;
    try {
      await getBridge().team.members.update(member.id, { enabled });
      await list.refresh();
    } catch (error) {
      failure = fail(error);
    } finally {
      busyId = null;
    }
  }

  async function openRemove(member: Member) {
    openMenu = null;
    removing = member;
    removeDetail = null;
    removeError = null;
    try {
      const preview = await getBridge().team.members.deletionPreview(member.id);
      if (removing?.id === member.id) removeDetail = previewLine(preview);
    } catch {
      // The preview is a courtesy: the removal itself reports a refusal.
    }
  }

  async function confirmRemove() {
    if (removing === null) return;
    const id = removing.id;
    removeBusy = true;
    removeError = null;
    try {
      await getBridge().team.members.remove(id);
      removing = null;
      await list.refresh();
    } catch (error) {
      removeError = fail(error);
    } finally {
      removeBusy = false;
    }
  }
</script>

<svelte:document onclick={() => (openMenu = null)} />

{#snippet addButton(label: string)}
  <button type="button" class="bridge-btn bridge-btn-primary" onclick={() => (inviting = true)}>{label}</button>
{/snippet}

<div class={className} {style} data-bridge-team-users data-loading={$list.loading} {...rest}>
  <div class="bridge-team-users-header">
    <h3 class="bridge-team-users-title">Team Members</h3>
    {#if $canManage}
      {@render addButton('Add Member')}
    {/if}
  </div>

  <div class="bridge-team-form-group">
    <input
      type="search"
      class="bridge-input"
      data-bridge-team-search
      placeholder="Search members"
      aria-label="Search members"
      bind:value={search}
      oninput={onSearch}
    />
  </div>

  {#if failure}
    <div class="bridge-team-alert"><Alert variant="error">{failure}</Alert></div>
  {:else if $list.error}
    <div class="bridge-team-alert"><Alert variant="error">{errorMessage($list.error, t)}</Alert></div>
  {/if}

  {#if loadingList}
    <div class="bridge-team-loading">
      <Spinner size={32} />
      <span>Loading team members...</span>
    </div>
  {:else if $list.value !== null && members.length === 0}
    <div class="bridge-team-empty">
      {#if query}
        <p>No members match your search.</p>
      {:else}
        <p>No team members yet.</p>
        {#if $canManage}
          {@render addButton('Add your first team member')}
        {/if}
      {/if}
    </div>
  {:else if members.length > 0}
    <div class="bridge-team-table-wrapper">
      <table class="bridge-team-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th>Status</th>
            {#if $canManage}<th></th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each members as member (member.id)}
            {@const off = isOff(member)}
            <tr data-member-id={member.id} data-loading={busyId === member.id}>
              <td>
                <div class="bridge-team-user-cell">
                  <div class="bridge-team-user-name">{nameOf(member)}</div>
                  <div class="bridge-team-user-email">{member.user.email}</div>
                </div>
              </td>
              <td>
                <span class="bridge-team-badge">{member.role || '—'}</span>
              </td>
              <td>
                <span class="bridge-team-status" data-state={off ? 'disabled' : member.status}>{statusLabel(member)}</span>
              </td>
              {#if $canManage}
                <td class="bridge-team-actions-cell">
                  <div class="bridge-team-actions" data-bridge-team-actions>
                    <button
                      type="button"
                      class="bridge-team-actions-trigger"
                      aria-label="Actions"
                      aria-expanded={openMenu === member.id}
                      disabled={busyId === member.id}
                      onclick={(e) => toggleMenu(e, member.id)}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                        <circle cx="8" cy="3" r="1.5" />
                        <circle cx="8" cy="8" r="1.5" />
                        <circle cx="8" cy="13" r="1.5" />
                      </svg>
                    </button>
                    {#if openMenu === member.id}
                      <div class="bridge-team-actions-menu">
                        <button type="button" class="bridge-team-actions-item" onclick={() => openEdit(member)}>Edit</button>
                        <button type="button" class="bridge-team-actions-item" onclick={() => setEnabled(member, off)}>
                          {off ? 'Enable' : 'Disable'}
                        </button>
                        <button
                          type="button"
                          class="bridge-team-actions-item bridge-team-actions-item--danger"
                          data-variant="danger"
                          onclick={() => openRemove(member)}
                        >
                          Remove
                        </button>
                      </div>
                    {/if}
                  </div>
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if hasMore}
      <button type="button" class="bridge-btn bridge-btn-secondary" data-bridge-team-more disabled={$list.loading} onclick={showMore}>
        Show more
      </button>
    {/if}
  {/if}
</div>

{#if $canManage}
  <InviteDialog open={inviting} onclose={() => (inviting = false)} oninvited={() => void list.refresh()} />

  <EditMemberDialog
    open={editing !== null}
    member={editing}
    onclose={() => (editing = null)}
    onupdated={() => void list.refresh()}
  />

  <ConfirmDialog
    open={removing !== null}
    title="Remove Member"
    message="Remove {removing ? nameOf(removing) : 'this member'} from the workspace? This cannot be undone."
    detail={removeDetail}
    error={removeError}
    confirmLabel="Remove"
    variant="danger"
    loading={removeBusy}
    onconfirm={confirmRemove}
    oncancel={() => (removing = null)}
  />
{/if}
