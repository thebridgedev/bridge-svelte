<!--
  The second step, for an app or a workspace that requires it, or a person who turned it on: the code from the
  person's authenticator app, or one Bridge sent by email or text message; "Use another way" switches between the ways
  the person may use and a recovery code; "Remember this device" skips the step here for the app's days. The first
  time, the person sets a way up: an authenticator app (a QR code drawn in the page, and the key to type) or a phone.
  After setup the recovery codes (or a text-message setup's backup code) are shown once, and the step that follows goes
  to `onStep` when the person has saved them. Every sign-in form shows it the same way.
-->
<script lang="ts">
  import type { SecondStepMethod, SignInStep } from '@nebulr-group/bridge-auth-core';
  import type { HTMLAttributes } from 'svelte/elements';
  import { onDestroy } from 'svelte';
  import type { BridgeMessages } from '../../core/config.js';
  import { holdSignInPage } from '../../core/guard.js';
  import { translator } from '../../core/i18n.js';
  import { codeErrorMessage, codeSpent } from '../../core/code-errors.js';
  import AuthFormWrapper from '../shared/AuthFormWrapper.svelte';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';
  import CodeInput from '../shared/CodeInput.svelte';
  import QrCode from '../shared/QrCode.svelte';
  import RecoveryCodes from '../shared/RecoveryCodes.svelte';

  type Waiting = Extract<SignInStep, { next: 'second_step' } | { next: 'second_step_setup' }>;
  type Asking = Extract<Waiting, { next: 'second_step' }>;
  type SettingUp = Extract<Waiting, { next: 'second_step_setup' }>;

  interface Props extends HTMLAttributes<HTMLDivElement> {
    step: Waiting;
    /** The next step: done, the code again, another way, or the setup. */
    onStep: (next: SignInStep) => void;
    messages?: BridgeMessages;
  }

  let { step, onStep, messages, class: className, style, ...rest }: Props = $props();
  const t = $derived(translator(messages));

  /** Shown once after setup, with the step that follows once the person saved it. */
  let backup = $state<{ code: string; then: SignInStep } | null>(null);
  let recovery = $state<{ codes: readonly string[]; then: SignInStep } | null>(null);
  let code = $state('');
  let phone = $state('');
  let recoveryInput = $state('');
  let backupInput = $state('');
  /** What the form shows: the code, the list of other ways, a recovery code, today's backup code, or the phone setup. */
  let view = $state<'code' | 'ways' | 'recovery' | 'backup' | 'phone'>('code');
  let remember = $state(false);
  let loading = $state(false);
  let failure = $state<string | null>(null);
  let spent = $state(false);

  const asking = $derived(step.next === 'second_step' ? (step as Asking) : null);
  const settingUp = $derived(step.next === 'second_step_setup' ? (step as SettingUp) : null);
  /** An older Bridge texts only, and resets a lost phone with the backup code. */
  const legacyText = $derived(asking !== null && asking.method === 'sms' && asking.methods.length <= 1 && asking.expiresIn === undefined);
  const otherWays = $derived(asking === null ? [] : asking.methods.filter((each) => each !== asking.method));
  const WAY_KEYS = { totp: 'secondStep.way.totp', email: 'secondStep.way.email', sms: 'secondStep.way.sms' } as const;

  // A finished step has signed the person in already, and the guard would move the sign-in page on before the recovery
  // codes (or the backup code) were saved. The page is held from the moment a code is sent until the person has saved
  // them; their Continue lets go and goes on with the step.
  $effect(() => holdSignInPage(loading || recovery !== null || backup !== null, 'second-step'));
  onDestroy(() => holdSignInPage(false, 'second-step'));

  /** Saved: the page is let go, and the step that waited goes on. */
  function savedThen(then: SignInStep) {
    recovery = null;
    backup = null;
    holdSignInPage(false, 'second-step');
    onStep(then);
  }

  async function run(action: () => Promise<SignInStep>) {
    if (loading) return;
    failure = null;
    loading = true;
    // Held before the code goes, not once the answer is in: signing in tells the guard at once.
    holdSignInPage(true, 'second-step');
    try {
      const next = await action();
      code = '';
      recoveryInput = '';
      backupInput = '';
      spent = false;
      view = 'code';
      if (next.done && next.recoveryCodes !== undefined && next.recoveryCodes.length > 0) recovery = { codes: next.recoveryCodes, then: next };
      else if (next.done && next.backupCode !== undefined) backup = { code: next.backupCode, then: next };
      else onStep(next);
    } catch (error) {
      failure = codeErrorMessage(error, t);
      spent = codeSpent(error);
      code = '';
    } finally {
      loading = false;
    }
  }

  const options = () => (remember ? { remember: true } : {});

  function submitCode(event?: Event) {
    event?.preventDefault();
    if (asking === null || code.length !== 6) return;
    const current = asking;
    void run(() => current.verify(code, options()));
  }
</script>

{#if recovery}
  <AuthFormWrapper heading={t('recovery.heading')} class={className} {style} data-bridge-sign-in-step="recovery-codes" {...rest}>
    <RecoveryCodes codes={recovery.codes} {t} onDone={() => recovery && savedThen(recovery.then)} />
  </AuthFormWrapper>
{:else if backup}
  <AuthFormWrapper heading={t('secondStep.backupHeading')} class={className} {style} data-bridge-sign-in-step="backup-code" {...rest}>
    <p class="bridge-step-desc">{t('secondStep.backupIntro')}</p>
    <div class="bridge-backup-code" data-bridge-backup-code>{backup.code}</div>
    <button type="button" class="bridge-btn bridge-btn-primary" onclick={() => backup && savedThen(backup.then)}>{t('secondStep.continue')}</button>
  </AuthFormWrapper>
{:else if settingUp}
  <AuthFormWrapper heading={settingUp.methods.includes('totp') && view !== 'phone' ? t('secondStep.chooseSetup') : t('secondStep.setupHeading')} class={className} {style} data-bridge-sign-in-step="second-step" data-bridge-second-step="second_step_setup" {...rest}>
    {#if failure}<Alert variant="error">{failure}</Alert>{/if}
    {#if settingUp.methods.includes('totp') && view !== 'phone'}
      <p class="bridge-step-desc">{t('secondStep.chooseSetupIntro')}</p>
      <button type="button" class="bridge-btn bridge-btn-primary" data-bridge-second-step-setup="totp" onclick={() => run(() => settingUp.setUpTotp())} disabled={loading}>
        {#if loading}<Spinner size={16} />{/if} {t('secondStep.setupTotp')}
      </button>
      {#if settingUp.methods.includes('sms')}
        <button type="button" class="bridge-btn bridge-btn-secondary" data-bridge-second-step-setup="sms" onclick={() => (view = 'phone')} disabled={loading}>{t('secondStep.setupPhone')}</button>
      {/if}
    {:else}
      <p class="bridge-step-desc">{t('secondStep.setupIntro')}</p>
      <form onsubmit={(event) => { event.preventDefault(); void run(() => settingUp.setUp(phone.trim())); }}>
        <div class="bridge-form-group">
          <label for="second-step-phone">{t('field.phone')}</label>
          <input id="second-step-phone" type="tel" autocomplete="tel" placeholder="+46 70 123 45 67" required bind:value={phone} disabled={loading} />
        </div>
        <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !phone.trim()}>
          {#if loading}<Spinner size={16} />{/if} {t('secondStep.sendCode')}
        </button>
      </form>
      {#if settingUp.methods.includes('totp')}
        <div class="bridge-forgot-row"><button type="button" class="bridge-link" onclick={() => (view = 'code')} disabled={loading}>{t('secondStep.anotherWay')}</button></div>
      {/if}
    {/if}
  </AuthFormWrapper>
{:else if asking}
  <AuthFormWrapper heading={asking.setup ? t('secondStep.scanHeading') : t('secondStep.heading')} class={className} {style} data-bridge-sign-in-step="second-step" data-bridge-second-step="second_step" data-bridge-second-step-method={asking.method} {...rest}>
    {#if failure}<Alert variant="error" id="second-step-error" data-bridge-second-step-error>{failure}</Alert>{/if}
    {#if view === 'ways'}
      <p class="bridge-step-desc">{t('secondStep.anotherWay')}</p>
      <div class="bridge-ways" data-bridge-second-step-ways>
        {#each otherWays as way (way)}
          <button type="button" class="bridge-btn bridge-btn-secondary" data-bridge-second-step-way={way} onclick={() => run(() => asking.chooseMethod(way as SecondStepMethod))} disabled={loading}>{t(WAY_KEYS[way])}</button>
        {/each}
        {#if asking.recovery && !legacyText}
          <button type="button" class="bridge-btn bridge-btn-secondary" data-bridge-second-step-way="recovery" onclick={() => { failure = null; view = 'recovery'; }} disabled={loading}>{t('secondStep.way.recovery')}</button>
        {/if}
      </div>
      <div class="bridge-forgot-row"><button type="button" class="bridge-link" onclick={() => (view = 'code')} disabled={loading}>{t('action.back')}</button></div>
    {:else if view === 'recovery'}
      <p class="bridge-step-desc">{t('secondStep.recoveryIntro')}</p>
      <form onsubmit={(event) => { event.preventDefault(); void run(() => asking.useRecoveryCode(recoveryInput.trim(), options())); }}>
        <div class="bridge-form-group">
          <label for="second-step-recovery">{t('field.recoveryCode')}</label>
          <input id="second-step-recovery" type="text" autocomplete="off" spellcheck="false" required bind:value={recoveryInput} disabled={loading} />
        </div>
        {#if asking.rememberDays > 0}
          <label class="bridge-check"><input type="checkbox" bind:checked={remember} data-bridge-remember-device /> {t('secondStep.remember', { days: asking.rememberDays })}</label>
        {/if}
        <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !recoveryInput.trim()}>
          {#if loading}<Spinner size={16} />{/if} {t('secondStep.continue')}
        </button>
      </form>
      <div class="bridge-forgot-row"><button type="button" class="bridge-link" onclick={() => (view = 'ways')} disabled={loading}>{t('secondStep.anotherWay')}</button></div>
    {:else if view === 'backup'}
      <form onsubmit={(event) => { event.preventDefault(); void run(() => asking.reset(backupInput.trim())); }}>
        <div class="bridge-form-group">
          <label for="second-step-backup">{t('field.backupCode')}</label>
          <input id="second-step-backup" type="text" autocomplete="off" required bind:value={backupInput} disabled={loading} />
        </div>
        <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !backupInput.trim()}>
          {#if loading}<Spinner size={16} />{/if} {t('secondStep.continue')}
        </button>
      </form>
    {:else}
      {#if asking.setup}
        <p class="bridge-step-desc">{t('secondStep.scanIntro')}</p>
        <QrCode value={asking.setup.uri} label={t('secondStep.qrLabel')} />
        <div class="bridge-form-group">
          <span class="bridge-key-label">{t('secondStep.keyLabel')}</span>
          <code class="bridge-totp-key" data-bridge-totp-key>{asking.setup.secret}</code>
        </div>
      {:else if asking.method === 'totp'}
        <p class="bridge-step-desc">{t('secondStep.totpIntro')}</p>
      {:else if asking.method === 'email'}
        {#if asking.note === 'texts_unavailable'}<Alert variant="info">{t('secondStep.textsUnavailable')}</Alert>{/if}
        <p class="bridge-step-desc">{t('secondStep.emailSent', { email: asking.email ?? '' })}</p>
      {:else if asking.sent}
        <p class="bridge-step-desc">{t('secondStep.codeSent', { phone: asking.phone })}</p>
      {:else}
        <Alert variant="error">{t('secondStep.notSent')}</Alert>
      {/if}
      <form onsubmit={submitCode}>
        <CodeInput id="second-step-code" label={asking.method === 'totp' ? t('field.authenticatorCode') : t('field.code')} bind:value={code} disabled={loading || spent} invalid={failure !== null} describedBy={failure ? 'second-step-error' : undefined} onComplete={() => submitCode()} />
        {#if asking.rememberDays > 0}
          <label class="bridge-check"><input type="checkbox" bind:checked={remember} data-bridge-remember-device /> {t('secondStep.remember', { days: asking.rememberDays })}</label>
        {/if}
        <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || spent || code.length !== 6}>
          {#if loading}<Spinner size={16} />{/if} {t('secondStep.verify')}
        </button>
      </form>
      {#if asking.method !== 'totp'}
        <div class="bridge-forgot-row">
          <button type="button" class="bridge-link" data-bridge-second-step-resend onclick={() => run(() => asking.resend())} disabled={loading}>{t('secondStep.resend')}</button>
        </div>
      {/if}
      {#if legacyText}
        <div class="bridge-forgot-row">
          <button type="button" class="bridge-link" data-bridge-second-step-backup onclick={() => (view = 'backup')} disabled={loading}>{t('secondStep.useBackup')}</button>
        </div>
      {:else if !asking.setup && (otherWays.length > 0 || asking.recovery)}
        <div class="bridge-forgot-row">
          <button type="button" class="bridge-link" data-bridge-second-step-another onclick={() => { failure = null; view = 'ways'; }} disabled={loading}>{t('secondStep.anotherWay')}</button>
        </div>
      {/if}
    {/if}
  </AuthFormWrapper>
{/if}

<style>
  @layer bridge {
    .bridge-ways {
      display: grid;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .bridge-check {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin: 0 0 0.75rem;
    }
    .bridge-key-label {
      display: block;
      font-size: 0.8125rem;
      color: var(--bridge-muted, #6b7280);
    }
    .bridge-totp-key {
      display: block;
      font-size: 1rem;
      letter-spacing: 0.05em;
      word-break: break-all;
      user-select: all;
    }
  }
</style>
