<script lang="ts">
  import WorkspaceSelector from '@bridge-svelte/lib/client/components/sdk-auth/WorkspaceSelector.svelte';
  import { profileStore } from '@bridge-svelte/lib/shared/profile';
  import { goto } from '$app/navigation';

  const { profile } = profileStore;

  function handleSwitch() {
    // After workspace switch, navigate to home so stale data is cleared
    goto('/');
  }
</script>

<div class="container">
  <h1>Workspace Switcher</h1>

  <p class="subtitle">
    Current workspace: <strong>{$profile?.tenant?.name ?? '—'}</strong>
  </p>

  <div class="card">
    <h2>Default renderer</h2>
    <p class="hint">
      Drop in <code>&lt;WorkspaceSelector&gt;</code> with no children and the built-in row UI
      is used automatically. Enable "Styles: On" in the nav to see the default appearance.
    </p>
    <WorkspaceSelector
      onSwitch={handleSwitch}
      onError={(err) => console.error('Workspace switch failed', err)}
    />
  </div>

  <div class="card">
    <h2>Custom row renderer</h2>
    <p class="hint">
      Pass a <code>workspaceItem</code> snippet to take full control of how each row looks.
      The component still handles fetching, loading state, and switching — your snippet just
      receives <code>&#123; workspace, isActive, isLoading &#125;</code> and renders whatever UI you need.
    </p>
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
</div>

<style>
  .container {
    max-width: 480px;
    margin: 2rem auto;
    padding: 0 1rem;
  }

  h1 {
    font-size: 1.75rem;
    color: #1f2937;
    margin-bottom: 0.5rem;
  }

  .subtitle {
    color: #6b7280;
    margin-bottom: 1.5rem;
  }

  .hint {
    font-size: 0.8rem;
    color: #6b7280;
    margin-bottom: 0.875rem;
    line-height: 1.5;
  }

  .hint code {
    background: #f3f4f6;
    padding: 0.1em 0.35em;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    color: #374151;
  }

  .card {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    padding: 1.25rem;
    margin-bottom: 1.5rem;
  }

  h2 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.75rem;
  }

  /* Custom snippet styles (consumer-side) */
  .custom-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    cursor: pointer;
    margin-bottom: 0.5rem;
    font-family: inherit;
    font-size: 0.875rem;
  }

  .custom-item--active {
    border-color: #3b82f6;
    background: #eff6ff;
  }

  .custom-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 9999px;
    background: #6366f1;
    color: white;
    font-weight: 700;
    font-size: 0.75rem;
  }
</style>
