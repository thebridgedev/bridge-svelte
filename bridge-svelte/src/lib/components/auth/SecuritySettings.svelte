<!--
  The signed-in person's Security settings: two-step verification (whether it is on, the ways set up and which is used
  first, adding an authenticator app with a QR code drawn in the page or a phone, removing one, turning it on for
  themselves, new recovery codes, forgetting remembered devices; an authenticator app is the strongest choice) and
  changing the password. Every change needs a recent sign-in: the person is asked to confirm it is them (the recheck
  dialog), then the change goes on.
-->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import { isBridgeError, type SecondStepMethod, type SecurityStatus } from '@nebulr-group/bridge-auth-core';
  import { getBridge } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import { codeErrorMessage } from '../../core/code-errors.js';
  import { withRecheck } from '../../core/recheck.js';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';
  import CodeInput from '../shared/CodeInput.svelte';
  import QrCode from '../shared/QrCode.svelte';
  import RecoveryCodes from '../shared/RecoveryCodes.svelte';
  import ChangePassword from './ChangePassword.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** Heading above two-step verification. @default "Two-step verification"; `null` for none */
    heading?: string | null;
    /** Show "Change password" under it. @default when the app takes passwords */
    showPassword?: boolean;
    onChange?: (status: SecurityStatus) => void;
    onError?: (error: unknown) => void;
    messages?: BridgeMessages;
  }

  let { heading = undefined, showPassword = undefined, onChange, onError, messages, class: className, ...rest }: Props = $props();
  const t = $derived(translator(messages));

  let status = $state<SecurityStatus | null>(null);
  let offered = $state(true);
  let passwords = $state(false);
  let busy = $state(false);
  let failure = $state<string | null>(null);
  let notice = $state<string | null>(null);
  /** What is being added now: the authenticator app (its QR code and key), or a phone (its number, then its code). */
  let adding = $state<{ kind: 'totp'; secret: string; uri: string } | { kind: 'phone'; sent: boolean; phone: string } | null>(null);
  let phone = $state('');
  let code = $state('');
  /** Recovery codes to show once. */
  let codes = $state<readonly string[] | null>(null);

  const WAY_KEYS = { totp: 'secondStep.way.totp', email: 'secondStep.way.email', sms: 'secondStep.way.sms' } as const;
  const has = (method: SecondStepMethod) => status?.methods.some((each) => each.method === method) === true;

  function fail(error: unknown) {
    if (isBridgeError(error, 'cancelled')) return;
    if (isBridgeError(error) && error.code === 'set_up_first') failure = t('security.setUpFirst');
    else if (isBridgeError(error) && (error.code === 'wrong_code' || error.code === 'code_expired')) failure = codeErrorMessage(error, t);
    else failure = errorMessage(error, t);
    onError?.(error);
  }

  function changed(next: SecurityStatus) {
    status = next;
    onChange?.(next);
  }

  async function act(action: () => Promise<void>) {
    if (busy) return;
    busy = true;
    failure = null;
    notice = null;
    try {
      await action();
    } catch (error) {
      fail(error);
    } finally {
      busy = false;
    }
  }

  onMount(async () => {
    const bridge = getBridge();
    bridge.signIn
      .options()
      .then((found) => (passwords = found.methods.includes('password')))
      .catch(() => undefined);
    try {
      if (!bridge.security.offered()) {
        offered = false;
        return;
      }
      status = await bridge.security.status();
    } catch (error) {
      fail(error);
    }
  });

  const startTotp = () =>
    act(async () => {
      const started = await withRecheck(() => getBridge().security.totp.start());
      code = '';
      adding = { kind: 'totp', secret: started.secret, uri: started.uri };
    });

  const sendPhone = (event: SubmitEvent) => {
    event.preventDefault();
    return act(async () => {
      const sent = await withRecheck(() => getBridge().security.sms.start(phone.trim()));
      code = '';
      adding = { kind: 'phone', sent: sent.sent, phone: sent.phone };
    });
  };

  const confirm = (event?: Event) => {
    event?.preventDefault();
    if (adding === null || code.length !== 6) return;
    const kind = adding.kind;
    return act(async () => {
      const security = getBridge().security;
      const added = await withRecheck(() => (kind === 'totp' ? security.totp.confirm(code) : security.sms.confirm(code)));
      adding = null;
      phone = '';
      code = '';
      changed(added);
      if (added.recoveryCodes !== undefined) codes = added.recoveryCodes;
    });
  };

  const useFirst = (method: SecondStepMethod) => act(async () => changed(await withRecheck(() => getBridge().security.change({ first: method }))));
  const turn = (on: boolean) => act(async () => changed(await withRecheck(() => getBridge().security.change({ on }))));
  const remove = (method: 'totp' | 'sms') => act(async () => changed(await withRecheck(() => getBridge().security.remove(method))));
  const renew = () =>
    act(async () => {
      codes = await withRecheck(() => getBridge().security.newRecoveryCodes());
      changed(await getBridge().security.status());
    });
  const forget = () =>
    act(async () => {
      await withRecheck(() => getBridge().security.forgetDevices());
      notice = t('security.devicesForgotten');
      changed(await getBridge().security.status());
    });
</script>

<div class="bridge-security {className ?? ''}" data-bridge-security {...rest}>
  {#if heading !== null}<h3>{heading ?? t('security.heading')}</h3>{/if}
  {#if failure}<Alert variant="error" data-bridge-security-error>{failure}</Alert>{/if}
  {#if notice}<Alert variant="info">{notice}</Alert>{/if}
  {#if !offered}
    <p data-bridge-security-unavailable>{t('security.notAvailable')}</p>
  {:else if status === null}
    <Spinner size={16} />
  {:else if !status.available}
    <p data-bridge-security-unavailable>{t('security.notAvailable')}</p>
  {:else if codes !== null}
    <h4>{t('recovery.heading')}</h4>
    <RecoveryCodes {codes} {t} onDone={() => (codes = null)} doneLabel={t('action.done')} />
  {:else}
    <p data-bridge-security-status={status.on ? 'on' : 'off'}>
      {status.on ? t('security.statusOn') : t('security.statusOff')}
      {#if status.requiredIn === 'all'}<span class="bridge-security-meta"> {t('security.required')}</span>{/if}
    </p>
    <p class="bridge-security-meta" data-bridge-security-strongest>{t('security.strongest')}</p>

    <ul class="bridge-security-ways">
      {#each status.methods as way (way.method)}
        <li data-bridge-security-way={way.method}>
          <div>
            <strong>{t(WAY_KEYS[way.method])}</strong>
            {#if way.phone}<div class="bridge-security-meta">{way.phone}</div>{/if}
            {#if way.email}<div class="bridge-security-meta">{way.email}</div>{/if}
          </div>
          {#if way.first}
            <span class="bridge-security-badge" data-bridge-security-first>{t('security.first')}</span>
          {:else}
            <button type="button" class="bridge-btn bridge-btn-secondary" data-bridge-security-use-first={way.method} onclick={() => useFirst(way.method)} disabled={busy}>{t('security.useFirst')}</button>
          {/if}
          {#if way.method !== 'email'}
            <button type="button" class="bridge-btn bridge-btn-secondary" data-bridge-security-remove={way.method} onclick={() => remove(way.method as 'totp' | 'sms')} disabled={busy}>{t('security.remove')}</button>
          {/if}
        </li>
      {/each}
    </ul>

    {#if adding?.kind === 'totp'}
      <div class="bridge-security-add" data-bridge-security-adding="totp">
        <p class="bridge-step-desc">{t('secondStep.scanIntro')}</p>
        <QrCode value={adding.uri} label={t('secondStep.qrLabel')} />
        <span class="bridge-security-meta">{t('secondStep.keyLabel')}</span>
        <code class="bridge-totp-key" data-bridge-totp-key>{adding.secret}</code>
        <form onsubmit={confirm}>
          <CodeInput id="security-totp-code" label={t('field.authenticatorCode')} bind:value={code} disabled={busy} onComplete={() => confirm()} />
          <button type="submit" class="bridge-btn bridge-btn-primary" disabled={busy || code.length !== 6}>{t('security.confirm')}</button>
          <button type="button" class="bridge-btn bridge-btn-secondary" onclick={() => (adding = null)} disabled={busy}>{t('security.cancel')}</button>
        </form>
      </div>
    {:else if adding?.kind === 'phone'}
      <div class="bridge-security-add" data-bridge-security-adding="phone">
        <p class="bridge-step-desc">{adding.sent ? t('secondStep.codeSent', { phone: adding.phone }) : t('secondStep.notSent')}</p>
        <form onsubmit={confirm}>
          <CodeInput id="security-sms-code" label={t('field.code')} bind:value={code} disabled={busy} onComplete={() => confirm()} />
          <button type="submit" class="bridge-btn bridge-btn-primary" disabled={busy || code.length !== 6}>{t('security.confirm')}</button>
          <button type="button" class="bridge-btn bridge-btn-secondary" onclick={() => (adding = null)} disabled={busy}>{t('security.cancel')}</button>
        </form>
      </div>
    {:else}
      <div class="bridge-security-actions">
        {#if status.allowed.includes('totp') && !has('totp')}
          <button type="button" class="bridge-btn bridge-btn-primary" data-bridge-security-add="totp" onclick={startTotp} disabled={busy}>{t('security.addTotp')}</button>
        {/if}
        {#if status.allowed.includes('sms') && !has('sms')}
          <form onsubmit={sendPhone} class="bridge-security-phone" data-bridge-security-add="sms">
            <div class="bridge-form-group">
              <label for="security-phone">{t('field.phone')}</label>
              <input id="security-phone" type="tel" autocomplete="tel" placeholder="+46 70 123 45 67" bind:value={phone} disabled={busy} />
            </div>
            <button type="submit" class="bridge-btn bridge-btn-secondary" disabled={busy || !phone.trim()}>{t('security.addPhone')}</button>
          </form>
        {/if}
      </div>
    {/if}

    {#if status.requiredIn !== 'all'}
      <button type="button" class="bridge-btn {status.self ? 'bridge-btn-secondary' : 'bridge-btn-primary'}" data-bridge-security-turn={status.self ? 'off' : 'on'} onclick={() => turn(!status?.self)} disabled={busy}>
        {status.self ? t('security.turnOff') : t('security.turnOn')}
      </button>
    {/if}

    {#if status.setUp}
      <div class="bridge-security-row" data-bridge-security-recovery>
        <span>{t('security.codesLeft', { count: status.recoveryCodesLeft })}</span>
        <button type="button" class="bridge-btn bridge-btn-secondary" data-bridge-security-new-codes onclick={renew} disabled={busy}>{t('security.newCodes')}</button>
      </div>
    {/if}
    {#if status.rememberedDevices > 0}
      <div class="bridge-security-row" data-bridge-security-devices>
        <span>{t('security.devices', { count: status.rememberedDevices })}</span>
        <button type="button" class="bridge-btn bridge-btn-secondary" data-bridge-security-forget onclick={forget} disabled={busy}>{t('security.forgetDevices')}</button>
      </div>
    {/if}
  {/if}

  {#if showPassword ?? passwords}
    <ChangePassword {messages} {onError} />
  {/if}
</div>

<style>
  @layer bridge {
    .bridge-security-ways {
      list-style: none;
      margin: 0.5rem 0 1rem;
      padding: 0;
    }
    .bridge-security-ways li,
    .bridge-security-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      justify-content: space-between;
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--bridge-border, #d1d5db);
    }
    .bridge-security-ways li > div {
      flex: 1;
    }
    .bridge-security-ways .bridge-btn,
    .bridge-security-row .bridge-btn {
      width: auto;
    }
    .bridge-security-meta {
      font-size: 0.8125rem;
      color: var(--bridge-muted, #6b7280);
    }
    .bridge-security-badge {
      font-size: 0.75rem;
      padding: 0.125rem 0.5rem;
      border-radius: 999px;
      background: var(--bridge-alert-success-bg, #f0fdf4);
      color: var(--bridge-alert-success-fg, #166534);
    }
    .bridge-security-actions {
      display: grid;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }
    .bridge-security-add {
      margin-bottom: 1rem;
    }
    .bridge-totp-key {
      display: block;
      margin-bottom: 0.75rem;
      word-break: break-all;
      user-select: all;
    }
    .bridge-change-password {
      margin-top: 1.5rem;
    }
  }
</style>
