<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import TeamProfileForm from './TeamProfileForm.svelte';
  import TeamUserList from './TeamUserList.svelte';
  import TeamWorkspaceForm from './TeamWorkspaceForm.svelte';

  type Tab = { id: 'users' | 'profile' | 'workspace'; label: string };

  interface Props extends HTMLAttributes<HTMLDivElement> {
    defaultTab?: 'users' | 'profile' | 'workspace';
    showProfileTab?: boolean;
    showWorkspaceTab?: boolean;
    onError?: (error: Error) => void;
    tabBar?: Snippet<[{ tabs: Tab[]; activeTab: string; setTab: (id: string) => void }]>;
  }

  let {
    defaultTab = 'users' as 'users' | 'profile' | 'workspace',
    showProfileTab = true,
    showWorkspaceTab = true,
    onError,
    tabBar,
    class: className,
    style,
    ...rest
  }: Props = $props();

  let activeTab = $state(defaultTab);

  const tabs = $derived(
    [
      { id: 'users' as const, label: 'Users' },
      showProfileTab && { id: 'profile' as const, label: 'Profile' },
      showWorkspaceTab && { id: 'workspace' as const, label: 'Workspace' },
    ].filter(Boolean) as Tab[],
  );

  function setTab(id: string) {
    activeTab = id as 'users' | 'profile' | 'workspace';
  }
</script>

<div class={className} {style} data-bridge-team-panel {...rest}>
  {#if tabs.length > 1}
    {#if tabBar}
      {@render tabBar({ tabs, activeTab, setTab })}
    {:else}
      <nav class="bridge-team-tabs">
        {#each tabs as tab (tab.id)}
          <button
            class="bridge-team-tab"
            data-active={activeTab === tab.id}
            onclick={() => setTab(tab.id)}
          >
            {tab.label}
          </button>
        {/each}
      </nav>
    {/if}
  {/if}

  <div class="bridge-team-tab-content">
    {#if activeTab === 'users'}
      <TeamUserList {onError} />
    {:else if activeTab === 'profile'}
      <TeamProfileForm {onError} />
    {:else if activeTab === 'workspace'}
      <TeamWorkspaceForm {onError} />
    {/if}
  </div>
</div>
