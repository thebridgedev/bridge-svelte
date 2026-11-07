<!--
  The workspace's name and logo. Editable for someone who may manage the team
  (the `teamManage` flag); read-only for everyone else. Bridge decides the
  change; a refusal shows its message.
-->
<script lang="ts">
  import type { Workspace } from '@nebulr-group/bridge-auth-core';
  import { untrack } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { getBridge } from '../../core/client.js';
  import { canManageTeam } from '../../core/flags.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import { resource, workspaces } from '../../core/stores.js';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    onError?: (error: unknown) => void;
  }

  let { onError, class: className, style, ...rest }: Props = $props();

  const t = translator();
  const canManage = canManageTeam();
  const current = resource((client) => client.team.workspace.get(), ['accounts.workspace_updated']);

  let base = $state<Workspace | null>(null);
  let name = $state('');
  let logo = $state('');
  let saving = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);

  const changed = $derived.by(() => {
    const fields: { name?: string; logo?: string } = {};
    if (base === null) return fields;
    if (name.trim() !== (base.name ?? '')) fields.name = name.trim();
    if (logo.trim() !== (base.logo ?? '')) fields.logo = logo.trim();
    return fields;
  });
  const dirty = $derived(Object.keys(changed).length > 0);

  function adopt(value: Workspace) {
    base = value;
    name = value.name ?? '';
    logo = value.logo ?? '';
  }

  // Fresh values from Bridge fill the form, unless the person is mid-edit.
  $effect(() => {
    const value = $current.value;
    if (value !== null) untrack(() => !dirty && adopt(value));
  });

  async function save() {
    if (!dirty) return;
    saving = true;
    error = null;
    success = null;
    try {
      adopt(await getBridge().team.workspace.update(changed));
      success = 'Workspace updated successfully.';
      void workspaces.refresh();
    } catch (err) {
      error = errorMessage(err, t);
      onError?.(err);
    } finally {
      saving = false;
    }
  }
</script>

<div class={className} {style} data-bridge-team-workspace data-readonly={!$canManage} {...rest}>
  <h3 class="bridge-team-section-title">Workspace Settings</h3>

  {#if base === null}
    {#if $current.error}
      <div class="bridge-team-alert"><Alert variant="error">{errorMessage($current.error, t)}</Alert></div>
    {:else}
      <div class="bridge-team-loading">
        <Spinner size={32} />
        <span>Loading workspace...</span>
      </div>
    {/if}
  {:else}
    {#if error}
      <div class="bridge-team-alert"><Alert variant="error">{error}</Alert></div>
    {/if}
    {#if success}
      <div class="bridge-team-alert"><Alert variant="success">{success}</Alert></div>
    {/if}

    {#if base.logo}
      <div class="bridge-team-logo">
        <img src={base.logo} alt="{base.name ?? 'Workspace'} logo" />
      </div>
    {/if}

    <form
      class="bridge-team-form"
      onsubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div class="bridge-team-form-group">
        <label for="bridge-workspace-name">Workspace Name</label>
        <input id="bridge-workspace-name" type="text" bind:value={name} disabled={saving || !$canManage} />
      </div>

      <div class="bridge-team-form-group">
        <label for="bridge-workspace-logo">Logo URL</label>
        <input
          id="bridge-workspace-logo"
          type="url"
          class="bridge-input"
          placeholder="https://"
          bind:value={logo}
          disabled={saving || !$canManage}
        />
      </div>

      {#if $canManage}
        <div class="bridge-team-form-actions">
          <button type="submit" class="bridge-btn bridge-btn-primary" disabled={saving || !dirty}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      {/if}
    </form>
  {/if}
</div>
