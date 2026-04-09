<script lang="ts">
  import type { TeamWorkspace } from '@thebridge/auth-core';
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';
  import Alert from '../sdk-auth/shared/Alert.svelte';
  import Spinner from '../sdk-auth/shared/Spinner.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    onError?: (error: Error) => void;
  }

  let {
    onError,
    class: className,
    style,
    ...rest
  }: Props = $props();

  let workspace = $state<TeamWorkspace | null>(null);
  let name = $state('');
  let locale = $state('');
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);

  onMount(() => {
    loadWorkspace();
  });

  async function loadWorkspace() {
    loading = true;
    error = null;
    try {
      const bridge = getBridgeAuth();
      workspace = await bridge.team.getWorkspace();
      name = workspace.name ?? '';
      locale = workspace.locale ?? '';
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to load workspace');
      error = e.message;
      onError?.(e);
    } finally {
      loading = false;
    }
  }

  async function handleSubmit() {
    saving = true;
    error = null;
    success = null;
    try {
      const bridge = getBridgeAuth();
      await bridge.team.updateWorkspace({ name, locale });
      success = 'Workspace updated successfully.';
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to update workspace');
      error = e.message;
      onError?.(e);
    } finally {
      saving = false;
    }
  }
</script>

<div class={className} {style} data-bridge-team-workspace {...rest}>
  <h3 class="bridge-team-section-title">Workspace Settings</h3>

  {#if loading}
    <div class="bridge-team-loading">
      <Spinner size={32} />
      <span>Loading workspace...</span>
    </div>
  {:else}
    {#if error}
      <div class="bridge-team-alert"><Alert variant="error">{error}</Alert></div>
    {/if}
    {#if success}
      <div class="bridge-team-alert"><Alert variant="success">{success}</Alert></div>
    {/if}

    {#if workspace?.logo}
      <div class="bridge-team-logo">
        <img src={workspace.logo} alt="{workspace.name} logo" />
      </div>
    {/if}

    <form class="bridge-team-form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      <div class="bridge-team-form-group">
        <label for="bridge-workspace-name">Workspace Name</label>
        <input
          id="bridge-workspace-name"
          type="text"
          bind:value={name}
          disabled={saving}
        />
      </div>

      <div class="bridge-team-form-group">
        <label for="bridge-workspace-locale">Locale</label>
        <input
          id="bridge-workspace-locale"
          type="text"
          bind:value={locale}
          placeholder="en"
          disabled={saving}
        />
      </div>

      {#if workspace?.plan}
        <div class="bridge-team-form-group">
          <label>Current Plan</label>
          <div class="bridge-team-readonly">{workspace.plan}</div>
        </div>
      {/if}

      <div class="bridge-team-form-group">
        <label>MFA</label>
        <div class="bridge-team-readonly">{workspace?.mfa ? 'Enabled' : 'Disabled'}</div>
      </div>

      <div class="bridge-team-form-actions">
        <button
          type="submit"
          class="bridge-btn bridge-btn-primary"
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  {/if}
</div>
