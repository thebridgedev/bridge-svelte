<!--
  The signed-in person's passkeys: each one's name, when it was added and
  last used, whether it syncs to their other devices, and who keeps it (the
  provider's name and icon, such as iCloud Keychain); adding one from this
  device, renaming one and removing one. The browser and the person's password
  manager are told which passkeys are still theirs (the Signal API, where the
  browser has it), so a removed one is no longer offered. Adding or removing needs a recent sign-in;
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
  /** The passkey being renamed, and the name typed. */
  let renaming = $state<string | null>(null);
  /** The person's password (TBP-862): whether they have one and may remove it, and the removal asked to be confirmed. */
  let password = $state<{ set: boolean; removable: boolean; why?: string } | null>(null);
  let confirmingRemoval = $state(false);
  let passwordNotice = $state<string | null>(null);
  let newName = $state('');

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
    // An older server has no answer about the password: no row then.
    password = await getBridge().passkeys.passwordState().catch(() => null);
  }

  async function removePassword() {
    if (busy) return;
    busy = true;
    failure = null;
    try {
      await getBridge().passkeys.removePassword();
      confirmingRemoval = false;
      passwordNotice = t('password.removed');
      await load();
    } catch (error) {
      if (isBridgeError(error, 'conflict') && error.code === 'no_passkey') failure = t('password.removeNeedsPasskey');
      else fail(error);
    } finally {
      busy = false;
    }
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

  async function rename(id: string) {
    if (busy || newName.trim() === '') return;
    busy = true;
    failure = null;
    try {
      await getBridge().passkeys.rename(id, newName.trim());
      renaming = null;
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
  {#if passkeys !== null && passkeys.some((each) => !each.usable)}
    <Alert variant="info"><span data-bridge-passkeys-unusable>{t('passkey.unusableNotice')}</span></Alert>
  {/if}
  {#if passkeys === null}
    <Spinner size={16} />
  {:else if passkeys.length === 0}
    <p data-bridge-passkeys-empty>{t('passkey.empty')}</p>
  {:else}
    <ul class="bridge-passkey-list">
      {#each passkeys as passkey (passkey.id)}
        <li data-bridge-passkey={passkey.id} data-unusable={passkey.usable ? undefined : 'true'}>
          {#if passkey.authenticator?.icon}<img class="bridge-passkey-icon" src={passkey.authenticator.icon} alt="" width="24" height="24" data-bridge-passkey-icon />{/if}
          <div>
            {#if renaming === passkey.id}
              <form onsubmit={(event) => { event.preventDefault(); void rename(passkey.id); }} data-bridge-passkey-rename-form>
                <input type="text" maxlength="64" aria-label={t('passkey.rename')} bind:value={newName} disabled={busy} />
                <button type="submit" class="bridge-btn bridge-btn-primary" data-bridge-passkey-rename-save disabled={busy || newName.trim() === ''}>{t('passkey.save')}</button>
              </form>
            {:else}
              <strong>{passkey.name}</strong>
            {/if}
            {#if passkey.authenticator && passkey.authenticator.name !== passkey.name}<div class="bridge-passkey-meta" data-bridge-passkey-authenticator>{passkey.authenticator.name}</div>{/if}
            {#if !passkey.usable}<div class="bridge-passkey-meta" data-bridge-passkey-unusable>{t('passkey.unusable')}</div>{/if}
            <div class="bridge-passkey-meta">
              {t('passkey.added', { date: date(passkey.createdAt) })}{#if passkey.lastUsedAt} · {t('passkey.lastUsed', { date: date(passkey.lastUsedAt) })}{/if}{#if passkey.deviceType === 'multiDevice'} · {t('passkey.synced')}{/if}
            </div>
          </div>
          {#if renaming !== passkey.id}
            <button type="button" class="bridge-btn bridge-btn-secondary" data-bridge-passkey-rename onclick={() => { renaming = passkey.id; newName = passkey.name; }} disabled={busy}>{t('passkey.rename')}</button>
          {/if}
          <button type="button" class="bridge-btn bridge-btn-secondary" data-bridge-passkey-remove onclick={() => remove(passkey.id)} disabled={busy}>{t('passkey.remove')}</button>
        </li>
      {/each}
    </ul>
  {/if}
  {#if password !== null}
    <div class="bridge-password-row" data-bridge-password-row={password.set ? 'set' : 'none'}>
      <h4>{t('password.rowHeading')}</h4>
      {#if passwordNotice}<Alert variant="success">{passwordNotice}</Alert>{/if}
      {#if !password.set}
        {#if !passwordNotice}<p>{t('password.none')}</p>{/if}
      {:else if confirmingRemoval}
        <p data-bridge-password-remove-confirm>{t('password.removeConfirm')}</p>
        <button type="button" class="bridge-btn bridge-btn-primary" data-bridge-password-remove-yes onclick={removePassword} disabled={busy}>{#if busy}<Spinner size={16} />{/if} {t('password.remove')}</button>
        <button type="button" class="bridge-link" onclick={() => (confirmingRemoval = false)} disabled={busy}>{t('passkey.offerLater')}</button>
      {:else}
        <p>{t('password.rowText')}</p>
        {#if password.removable}
          <button type="button" class="bridge-btn bridge-btn-secondary" data-bridge-password-remove onclick={() => (confirmingRemoval = true)} disabled={busy}>{t('password.remove')}</button>
        {:else if password.why === 'no_passkey'}
          <p class="bridge-passkey-meta" data-bridge-password-needs-passkey>{t('password.removeNeedsPasskey')}</p>
        {/if}
      {/if}
    </div>
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
