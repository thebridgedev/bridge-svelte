<script lang="ts">
  import WorkspaceSelector from '@bridge-svelte/lib/client/components/sdk-auth/WorkspaceSelector.svelte';
  import { profileStore } from '@bridge-svelte/lib/shared/profile';
  import { goto } from '$app/navigation';
  import FeaturePage from '$lib/components/FeaturePage.svelte';
  import { getDoc, section } from '$lib/learning';

  const { profile } = profileStore;

  // Content from the single source of truth — bridge-svelte/learning/multi-tenancy.
  const doc = getDoc('multi-tenancy');
  const sel = section(doc, 'WorkspaceSelector');

  const codeTabs = [
    sel?.code[0] && { label: 'Usage', code: sel.code[0].code, lang: 'svelte' },
    sel?.code[1] && { label: 'Custom row', code: sel.code[1].code, lang: 'svelte' },
  ].filter(Boolean) as { label: string; code: string; lang: string }[];

  const related = [
    { label: 'Team Management', href: '/team-panel' },
    { label: 'Branding', href: '/branding' },
  ];

  function handleSwitch() {
    goto('/');
  }
</script>

<FeaturePage
  title="Workspaces & tenancy"
  breadcrumb="Team & tenancy / Workspaces"
  oneLiner={doc?.frontmatter.oneLiner ?? ''}
  introHtml={doc?.introHtml ?? ''}
  {codeTabs}
  props={sel?.props ?? null}
  {related}
>
  {#snippet live()}
    <p class="ws-current">
      Active workspace: <strong>{$profile?.tenant?.name ?? '—'}</strong>
    </p>

    <div class="ws-block">
      <span class="ws-label">Default renderer</span>
      <WorkspaceSelector
        onSwitch={handleSwitch}
        onError={(err) => console.error('Workspace switch failed', err)}
      />
    </div>

    <div class="ws-block">
      <span class="ws-label">Custom row renderer</span>
      <WorkspaceSelector onSwitch={handleSwitch}>
        {#snippet workspaceItem({ workspace, isActive, isLoading, onSelect })}
          <button
            type="button"
            class="custom-item"
            class:custom-item--active={isActive}
            disabled={isLoading}
            onclick={onSelect}
          >
            <span class="custom-badge">{workspace.tenant.name.charAt(0)}</span>
            <span>
              <strong>{workspace.tenant.name}</strong>
              {#if isActive}<em> (current)</em>{/if}
              {#if isLoading}<em> switching…</em>{/if}
            </span>
          </button>
        {/snippet}
      </WorkspaceSelector>
    </div>
  {/snippet}
</FeaturePage>

<style>
  .ws-current {
    margin: 0 0 16px;
    font-size: 13px;
    color: var(--text-muted);
  }
  .ws-block {
    margin-bottom: 18px;
  }
  .ws-label {
    display: block;
    font: 600 9.5px ui-monospace, monospace;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-faint);
    margin-bottom: 8px;
  }
  .custom-item {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    cursor: pointer;
    margin-bottom: 0.5rem;
    font-family: inherit;
    font-size: 0.85rem;
    color: var(--text);
  }
  .custom-item--active {
    border-color: var(--primary);
    background: var(--primary-soft);
  }
  .custom-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 9999px;
    background: var(--primary);
    color: #fff;
    font-weight: 700;
    font-size: 0.72rem;
  }
</style>
