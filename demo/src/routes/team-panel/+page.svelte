<script lang="ts">
  import TeamManagementPanel from '@bridge-svelte/lib/client/components/team/TeamManagementPanel.svelte';

  function handleError(error: Error) {
    console.error('[TeamPanel]', error);
  }
</script>

<div class="team-panel-page">
  <h1>Team Management (Native SDK)</h1>
  <p class="subtitle">This uses the native <code>TeamManagementPanel</code> component — no iframe, direct GraphQL.</p>

  <!--
    Demonstrates the custom tabBar snippet — full control over tab navigation.
    Consumer provides their own tab markup; the component passes tabs/activeTab/setTab.
  -->
  <TeamManagementPanel onError={handleError}>
    {#snippet tabBar({ tabs, activeTab, setTab })}
      <nav class="my-tabs">
        {#each tabs as tab}
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
</div>

<style>
  .team-panel-page {
    padding: 2rem;
  }

  h1 {
    margin-bottom: 0.5rem;
    color: #1f2937;
  }

  .subtitle {
    margin-bottom: 2rem;
    color: #6b7280;
    font-size: 0.875rem;
  }

  code {
    background: #f3f4f6;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.8125rem;
  }

  /* Custom tab bar demonstration */
  .my-tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    padding-bottom: 0.75rem;
    border-bottom: 2px solid #e5e7eb;
  }

  .my-tab {
    padding: 0.5rem 1rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    background: #f9fafb;
    color: #6b7280;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .my-tab:hover {
    border-color: #3b82f6;
    color: #3b82f6;
  }

  .my-tab--active {
    background: #3b82f6;
    border-color: #3b82f6;
    color: #ffffff;
  }
</style>
