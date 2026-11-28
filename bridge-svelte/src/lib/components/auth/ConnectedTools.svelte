<!--
  The signed-in person's connected tools, for the Security settings: each AI
  assistant and command-line tool signed in to their account, with its name,
  kind, workspace, when it connected and was last used, and Disconnect after a
  confirm (it can no longer renew, and its calls are refused). Browser
  sessions are not listed here. A server that does not say which sessions are
  tools: the section is not shown.
-->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import { getBridge } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';
  import { toolRows, withoutTool, type ListedSession, type ToolRow } from './connected-tools.js';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** Heading above the list. @default "Connected tools"; `null` for none */
    heading?: string | null;
    /** Called after a tool was disconnected. */
    onChange?: (tools: readonly ToolRow[]) => void;
    onError?: (error: unknown) => void;
    messages?: BridgeMessages;
  }

  let { heading = undefined, onChange, onError, messages, class: className, ...rest }: Props = $props();

  const t = $derived(translator(messages));
  let tools = $state<ToolRow[] | null>(null);
  let shown = $state(true);
  let busy = $state(false);
  let failure = $state<string | null>(null);
  /** The tool waiting for the confirm. */
  let confirming = $state<string | null>(null);

  const date = (value: string | null) => (value === null ? '' : new Date(value).toLocaleDateString());

  onMount(async () => {
    try {
      const rows = toolRows((await getBridge().sessions.list()) as readonly ListedSession[]);
      if (rows === null) shown = false;
      else tools = rows;
    } catch (error) {
      shown = false;
      onError?.(error);
    }
  });

  async function disconnect(tool: ToolRow) {
    if (busy) return;
    busy = true;
    failure = null;
    try {
      await getBridge().sessions.end(tool.id);
      tools = withoutTool(tools ?? [], tool.id);
      confirming = null;
      onChange?.(tools);
    } catch (error) {
      failure = errorMessage(error, t);
      onError?.(error);
    } finally {
      busy = false;
    }
  }
</script>

{#if shown}
  <div class="bridge-connected-tools {className ?? ''}" data-bridge-connected-tools {...rest}>
    {#if heading !== null}<h3>{heading ?? t('tools.heading')}</h3>{/if}
    <p class="bridge-passkey-meta">{t('tools.intro')}</p>
    {#if failure}<Alert variant="error">{failure}</Alert>{/if}
    {#if tools === null}
      <Spinner size={16} />
    {:else if tools.length === 0}
      <p data-bridge-connected-tools-empty>{t('tools.empty')}</p>
    {:else}
      <ul class="bridge-passkey-list">
        {#each tools as tool (tool.id)}
          <li data-bridge-connected-tool={tool.id} data-kind={tool.kind}>
            <div>
              <strong>{tool.name}</strong>
              <div class="bridge-passkey-meta">
                {[tool.kind === 'assistant' ? t('tools.assistant') : t('tools.cli'), tool.workspace, t('tools.connected', { date: date(tool.signedInAt) }), tool.lastUsedAt === null ? null : t('tools.lastUsed', { date: date(tool.lastUsedAt) })].filter(Boolean).join(' · ')}
              </div>
              {#if confirming === tool.id}
                <div role="alertdialog" aria-label={t('tools.disconnect')} data-bridge-connected-tool-confirm>
                  <p>{t('tools.confirm', { name: tool.name })}</p>
                  <button type="button" class="bridge-btn bridge-btn-primary" data-bridge-connected-tool-disconnect-confirm onclick={() => disconnect(tool)} disabled={busy}>
                    {#if busy}<Spinner size={16} />{/if} {t('tools.disconnect')}
                  </button>
                  <button type="button" class="bridge-btn bridge-btn-secondary" onclick={() => (confirming = null)} disabled={busy}>{t('tools.cancel')}</button>
                </div>
              {/if}
            </div>
            {#if confirming !== tool.id}
              <button type="button" class="bridge-btn bridge-btn-secondary" data-bridge-connected-tool-disconnect onclick={() => (confirming = tool.id)} disabled={busy}>{t('tools.disconnect')}</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
