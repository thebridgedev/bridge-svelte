<!--
  The signed-in person's passkeys: each one's name, when it was added and
  last used, and whether it syncs to their other devices; adding one from
  this device and removing one. Adding or removing needs a recent sign-in;
  otherwise the person is asked to sign in again. The last way to sign in
  cannot be removed.
-->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import { isBridgeError, type PasskeyInfo } from '@nebulr-group/bridge-auth-core';
  import { getBridge } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** Heading above the list. @default "Passkeys"; `null` for none */
    heading?: string | null;
    /** Called after a passkey was added or removed. */
    onChange?: (passkeys: readonly PasskeyInfo[]) => void;
    onError?: (error: unknown) => void;
    messages?: BridgeMessages;
  }

  let { heading = undefined, onChange, onError, messages, class: className, ...rest }: Props = $props();

  const t = $derived(translator(messages));
  let passkeys = $state<PasskeyInfo[] | null>(null);
  let supported = $state(false);
  let name = $state('');
  let busy = $state(false);
  let failure = $state<string | null>(null);

  const date = (value: string | null) => (value === null ? '' : new Date(value).toLocaleDateString());

  function fail(error: unknown) {
    if (isBridgeError(error, 'cancelled')) failure = t('passkey.cancelled');
    else if (isBridgeError(error, 'reauthenticate')) failure = t('passkey.reauthenticate');
    else if (isBridgeError(error, 'conflict') && error.code === 'last_sign_in_method') failure = t('passkey.lastMethod');
    else if (isBridgeError(error, 'conflict') && error.code === 'passkey_exists') failure = t('passkey.exists');
    else failure = errorMessage(error, t);
    onError?.(error);
  }

  async function load() {
    passkeys = await getBridge().passkeys.list();
  }

  onMount(async () => {
    supported = await getBridge().passkeys.supported();
    await load().catch(fail);
  });

  async function add() {
    if (busy) return;
    busy = true;
    failure = null;
    try {
      await getBridge().passkeys.add(name.trim() || undefined);
      name = '';
      await load();
      onChange?.(passkeys ?? []);
    } catch (error) {
      fail(error);
    } finally {
      busy = false;
    }
  }

  async function remove(id: string) {
    if (busy) return;
    busy = true;
    failure = null;
    try {
      await getBridge().passkeys.remove(id);
      await load();
      onChange?.(passkeys ?? []);
    } catch (error) {
      fail(error);
    } finally {
      busy = false;
    }
  }
</script>

<div class="bridge-passkeys {className ?? ''}" data-bridge-passkeys {...rest}>
  {#if heading !== null}<h3>{heading ?? t('passkey.manageHeading')}</h3>{/if}
  {#if failure}<Alert variant="error">{failure}</Alert>{/if}
  {#if passkeys === null}
    <Spinner size={16} />
  {:else if passkeys.length === 0}
    <p data-bridge-passkeys-empty>{t('passkey.empty')}</p>
  {:else}
    <ul class="bridge-passkey-list">
      {#each passkeys as passkey (passkey.id)}
        <li data-bridge-passkey={passkey.id}>
          <div>
            <strong>{passkey.name}</strong>
            <div class="bridge-passkey-meta">
              {t('passkey.added', { date: date(passkey.createdAt) })}{#if passkey.lastUsedAt} · {t('passkey.lastUsed', { date: date(passkey.lastUsedAt) })}{/if}{#if passkey.deviceType === 'multiDevice'} · {t('passkey.synced')}{/if}
            </div>
          </div>
          <button type="button" class="bridge-btn bridge-btn-secondary" data-bridge-passkey-remove onclick={() => remove(passkey.id)} disabled={busy}>{t('passkey.remove')}</button>
        </li>
      {/each}
    </ul>
  {/if}
  {#if supported}
    <form onsubmit={(event) => { event.preventDefault(); void add(); }} class="bridge-passkey-add">
      <input type="text" maxlength="64" placeholder={t('passkey.namePlaceholder')} bind:value={name} disabled={busy} />
      <button type="submit" class="bridge-btn bridge-btn-primary" data-bridge-passkey-add disabled={busy}>
        {#if busy}<Spinner size={16} />{/if} {t('passkey.add')}
      </button>
    </form>
  {:else}
    <p>{t('passkey.unsupported')}</p>
  {/if}
</div>
