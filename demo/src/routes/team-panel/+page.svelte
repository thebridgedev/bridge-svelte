<script lang="ts">
  import TeamManagementPanel from '@bridge-svelte/lib/client/components/team/TeamManagementPanel.svelte';
  import FeaturePage from '$lib/components/FeaturePage.svelte';
  import { getDoc, section } from '$lib/learning';

  // Content from the single source of truth — bridge-svelte/learning/team-management.
  const doc = getDoc('team-management');
  const panel = section(doc, 'TeamManagementPanel');

  const codeTabs = [
    panel?.code[0] && { label: 'Usage', code: panel.code[0].code, lang: 'svelte' },
    panel?.code[1] && { label: 'Custom tab bar', code: panel.code[1].code, lang: 'svelte' },
  ].filter(Boolean) as { label: string; code: string; lang: string }[];

  const related = [
    { label: 'Workspaces', href: '/workspaces' },
    { label: 'API tokens', href: '/api-tokens' },
  ];

  function handleError(error: Error) {
    console.error('[TeamPanel]', error);
  }
</script>

<FeaturePage
  title="Team Management"
  breadcrumb="Team & tenancy / Team Management"
  oneLiner={doc?.frontmatter.oneLiner ?? ''}
  introHtml={doc?.introHtml ?? ''}
  {codeTabs}
  props={panel?.props ?? null}
  {related}
>
  {#snippet live()}
    <!-- Real SDK component — custom tabBar snippet shows full control over nav. -->
    <TeamManagementPanel onError={handleError}>
      {#snippet tabBar({ tabs, activeTab, setTab })}
        <nav class="my-tabs">
          {#each tabs as tab (tab.id)}
            <button
              class="my-tab"
              class:my-tab--active={activeTab === tab.id}
              onclick={() => setTab(tab.id)}
            >
              {tab.label}
            </button>
          {/each}
        </nav>
      {/snippet}
    </TeamManagementPanel>
  {/snippet}
</FeaturePage>

<style>
  .my-tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.25rem;
    padding-bottom: 0.6rem;
    border-bottom: 2px solid var(--border);
  }
  .my-tab {
    padding: 0.4rem 0.85rem;
    border: 1px solid var(--border-2);
    border-radius: 0.375rem;
    background: var(--surface-2);
    color: var(--text-muted);
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }
  .my-tab:hover {
    border-color: var(--primary);
    color: var(--primary);
  }
  .my-tab--active {
    background: var(--primary);
    border-color: var(--primary);
    color: #fff;
  }
</style>
