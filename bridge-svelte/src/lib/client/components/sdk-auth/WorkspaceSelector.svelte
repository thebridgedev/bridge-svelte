<script lang="ts">
  import type { HTMLDivAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';
  import type { Workspace } from '@thebridge/auth-core';
  import { onMount } from 'svelte';
  import { getBridgeAuth, profileStore } from '../../../core/bridge-instance.js';
  import Spinner from './shared/Spinner.svelte';
  import Alert from './shared/Alert.svelte';

  interface Props extends HTMLDivAttributes {
    onSwitch?: () => void;
    onError?: (error: Error) => void;
    workspaceItem?: Snippet<[{ workspace: Workspace; isActive: boolean; isLoading: boolean; onSelect: () => void }]>;
  }

  let {
    onSwitch,
    onError,
    workspaceItem,
    class: className,
    style,
    ...rest
  }: Props = $props();

  let workspaces = $state<Workspace[]>([]);
  let loadError = $state<string | null>(null);
  let loadingList = $state(true);
  let switchingId = $state<string | null>(null);
  let switchError = $state<string | null>(null);

  const currentWorkspaceId = $derived($profileStore?.id ?? null);

  onMount(async () => {
    try {
      workspaces = await getBridgeAuth().getWorkspaces();
    } catch (err: any) {
      loadError = err.message || 'Failed to load workspaces.';
    } finally {
      loadingList = false;
    }
  });

  async function handleSelect(workspace: Workspace) {
    if (switchingId) return;
    switchError = null;
    switchingId = workspace.id;
    try {
      await getBridgeAuth().switchWorkspace(workspace.id);
      onSwitch?.();
    } catch (err: any) {
      switchError = err.message || 'Failed to switch workspace.';
      onError?.(err);
    } finally {
      switchingId = null;
    }
  }
</script>

<div
  class={className}
  {style}
  data-bridge-workspace-selector
  data-loading-list={loadingList}
  {...rest}
>
  {#if loadError || switchError}
    <Alert variant="error">{loadError ?? switchError}</Alert>
  {/if}

  {#if loadingList}
    <div data-bridge-workspace-loading>
      <Spinner size={24} />
    </div>
  {:else}
    <div data-bridge-workspace-list>
      {#each workspaces as ws (ws.id)}
        {#if workspaceItem}
          {@render workspaceItem({ workspace: ws, isActive: ws.id === currentWorkspaceId, isLoading: switchingId === ws.id, onSelect: () => handleSelect(ws) })}
        {:else}
          <button
            type="button"
            data-bridge-workspace-item
            data-tenant-id={ws.tenant.id}
            data-active={ws.id === currentWorkspaceId}
            data-loading={switchingId === ws.id}
            disabled={!!switchingId}
            onclick={() => handleSelect(ws)}
          >
            <span data-bridge-workspace-avatar>
              {#if ws.tenant.logo}
                <img src={ws.tenant.logo} alt={ws.tenant.name} />
              {:else}
                {ws.tenant.name.charAt(0).toUpperCase()}
              {/if}
            </span>
            <span data-bridge-workspace-info>
              <span data-bridge-workspace-name>{ws.tenant.name}</span>
              <span data-bridge-workspace-user>{ws.fullName}</span>
            </span>
            {#if switchingId === ws.id}
              <Spinner size={18} />
            {/if}
          </button>
        {/if}
      {/each}
    </div>
  {/if}
</div>
<!-- no <style> block -->
