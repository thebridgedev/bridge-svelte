<!--
  The workspace list, for two moments:

  - **At sign-in**, when the person belongs to several: pass the step's
    `workspaces` and `onChoose`. SignInForm, VerifyEmail and the hand-off page
    do this for you.
  - **To switch** while signed in: pass nothing. It lists the person's
    workspaces and moves the session (every tab follows) on a click.

  Each row renders as a button; `workspaceItem` replaces a row.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import type { WorkspaceChoice } from '@nebulr-group/bridge-auth-core';
  import { getBridge } from '../../core/client.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { session, workspaces as myWorkspaces } from '../../core/stores.js';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';

  interface Row {
    readonly id: string;
    readonly name: string | null;
    readonly logo: string | null;
    /** A step this SDK cannot do yet, so the row cannot be chosen. */
    readonly needs?: string;
  }

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** The sign-in step's workspaces. Leave out to switch between the person's own. */
    workspaces?: readonly WorkspaceChoice[];
    /** Called with the chosen id at sign-in. Resolve when the step is done. */
    onChoose?: (workspaceId: string) => Promise<void>;
    /** Called after a switch. */
    onSwitch?: (workspaceId: string) => void;
    workspaceItem?: Snippet<[{ workspace: Row; isActive: boolean; isLoading: boolean; onSelect: () => void }]>;
    messages?: BridgeMessages;
  }

  let { workspaces, onChoose, onSwitch, workspaceItem, messages, class: className, style, ...rest }: Props = $props();

  const t = $derived(translator(messages));
  const choosing = $derived(workspaces !== undefined);
  const rows: readonly Row[] = $derived(
    choosing ? (workspaces ?? []) : ($myWorkspaces.value ?? []).map((w) => ({ id: w.id, name: w.name, logo: w.logo })),
  );
  const loadingList = $derived(!choosing && $myWorkspaces.value === null && $myWorkspaces.error === null);
  const currentId = $derived($session.status === 'signed-in' && !choosing ? ($session.workspace?.id ?? null) : null);

  let busyId = $state<string | null>(null);
  let failure = $state<string | null>(null);

  async function select(row: Row) {
    if (busyId !== null || row.needs !== undefined) return;
    failure = null;
    busyId = row.id;
    try {
      if (choosing) {
        await onChoose?.(row.id);
      } else {
        if (row.id !== currentId) await getBridge().workspaces.switch(row.id);
        onSwitch?.(row.id);
      }
    } catch (error) {
      failure = errorMessage(error, t, choosing ? 'workspace.error.select' : 'workspace.error.switch');
    } finally {
      busyId = null;
    }
  }

  const initial = (name: string | null) => (name ?? '?').trim().charAt(0).toUpperCase() || '?';
</script>

<div class={className} {style} data-bridge-workspace-selector data-loading-list={loadingList} {...rest}>
  {#if failure}
    <Alert variant="error">{failure}</Alert>
  {:else if !choosing && $myWorkspaces.error}
    <Alert variant="error">{errorMessage($myWorkspaces.error, t, 'workspace.error.load')}</Alert>
  {/if}

  {#if loadingList}
    <div data-bridge-workspace-loading><Spinner size={24} /></div>
  {:else if rows.length === 0}
    <p class="bridge-step-desc" data-bridge-workspace-empty>{t('workspace.empty')}</p>
  {:else}
    <div data-bridge-workspace-list>
      {#each rows as row (row.id)}
        {@const isActive = row.id === currentId}
        {@const isLoading = busyId === row.id}
        {#if workspaceItem}
          {@render workspaceItem({ workspace: row, isActive, isLoading, onSelect: () => select(row) })}
        {:else}
          <button
            type="button"
            data-bridge-workspace-item
            data-workspace-id={row.id}
            data-active={isActive}
            data-loading={isLoading}
            disabled={busyId !== null || row.needs !== undefined}
            title={row.needs !== undefined ? t('login.error.unsupportedStep') : undefined}
            onclick={() => select(row)}
          >
            <span data-bridge-workspace-avatar>
              {#if row.logo}<img src={row.logo} alt="" />{:else}{initial(row.name)}{/if}
            </span>
            <span data-bridge-workspace-info>
              <span data-bridge-workspace-name>{row.name ?? row.id}</span>
              {#if isActive}<span data-bridge-workspace-user>{t('workspace.current')}</span>{/if}
            </span>
            {#if isLoading}<Spinner size={18} />{/if}
          </button>
        {/if}
      {/each}
    </div>
  {/if}
</div>
