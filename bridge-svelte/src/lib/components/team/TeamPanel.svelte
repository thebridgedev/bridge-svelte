<!--
  The team panel: members, pending invites, workspace settings and the
  person's own profile, as tabs. The Invites tab shows only for someone who
  may manage the team (the `teamManage` flag). `tabBar` replaces the tabs.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { canManageTeam } from '../../core/flags.js';
  import InviteList from './InviteList.svelte';
  import MemberList from './MemberList.svelte';
  import ProfileForm from './ProfileForm.svelte';
  import WorkspaceForm from './WorkspaceForm.svelte';

  type TabId = 'members' | 'invites' | 'workspace' | 'profile';
  type Tab = { id: TabId; label: string };

  interface Props extends HTMLAttributes<HTMLDivElement> {
    defaultTab?: TabId;
    showInvitesTab?: boolean;
    showWorkspaceTab?: boolean;
    showProfileTab?: boolean;
    onError?: (error: unknown) => void;
    tabBar?: Snippet<[{ tabs: Tab[]; activeTab: string; setTab: (id: string) => void }]>;
  }

  let {
    defaultTab = 'members',
    showInvitesTab = true,
    showWorkspaceTab = true,
    showProfileTab = true,
    onError,
    tabBar,
    class: className,
    style,
    ...rest
  }: Props = $props();

  const canManage = canManageTeam();

  // svelte-ignore state_referenced_locally
  let chosen = $state<TabId>(defaultTab);

  const tabs = $derived(
    [
      { id: 'members', label: 'Members' } as Tab,
      showInvitesTab && $canManage && ({ id: 'invites', label: 'Invites' } as Tab),
      showWorkspaceTab && ({ id: 'workspace', label: 'Workspace' } as Tab),
      showProfileTab && ({ id: 'profile', label: 'Profile' } as Tab),
    ].filter((tab): tab is Tab => Boolean(tab)),
  );

  // A tab that is no longer offered (its flag turned off) falls back to the first.
  const activeTab = $derived(tabs.some((tab) => tab.id === chosen) ? chosen : tabs[0].id);

  function setTab(id: string) {
    if (tabs.some((tab) => tab.id === id)) chosen = id as TabId;
  }
</script>

<div class={className} {style} data-bridge-team-panel {...rest}>
  {#if tabs.length > 1}
    {#if tabBar}
      {@render tabBar({ tabs, activeTab, setTab })}
    {:else}
      <nav class="bridge-team-tabs">
        {#each tabs as tab (tab.id)}
          <button type="button" class="bridge-team-tab" data-active={activeTab === tab.id} onclick={() => setTab(tab.id)}>
            {tab.label}
          </button>
        {/each}
      </nav>
    {/if}
  {/if}

  <div class="bridge-team-tab-content">
    {#if activeTab === 'members'}
      <MemberList {onError} />
    {:else if activeTab === 'invites'}
      <InviteList {onError} />
    {:else if activeTab === 'workspace'}
      <WorkspaceForm {onError} />
    {:else if activeTab === 'profile'}
      <ProfileForm {onError} />
    {/if}
  </div>
</div>
