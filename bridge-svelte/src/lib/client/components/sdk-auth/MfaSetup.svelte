<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import type { MessageOverrides } from '@nebulr-group/bridge-auth-core';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';
  import { getTranslator } from '../../stores/i18n.js';
  import AuthFormWrapper from './shared/AuthFormWrapper.svelte';
  import Spinner from './shared/Spinner.svelte';
  import Alert from './shared/Alert.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    onComplete?: () => void;
    onError?: (error: Error) => void;
    /**
     * Step description. Pass `null`/`''` to render nothing and use your own
     * subtitle (TBP-631).
     *
     * This component has THREE steps, each with its own description, but one
     * wrapper — so a single string here applies to every step. That is the
     * right trade for the dominant case (a host that owns the copy suppresses
     * all of them with `null`); to reword an individual step, override the
     * per-step key through the message catalogue rather than this prop.
     */
    description?: string | null;
    /** Per-key copy overrides for this component only (TBP-630). */
    messages?: MessageOverrides;
  }

  let {
    onComplete,
    onError,
    description = undefined,
    messages,
    class: className,
    style,
    ...rest
  }: Props = $props();

  const t = $derived(getTranslator(messages));

  let step = $state<'phone' | 'verify' | 'backup'>('phone');

  // TBP-631 — the three step descriptions used to sit inline in the markup,
  // outside AuthFormWrapper's guard, so `heading={null}` could not reach them.
  // They live in one wrapper rather than three, so the wrapper cannot know the
  // step — the component computes it and hands over a reactive value.
  // `undefined` = not overridden (use the built-in); `null` = host suppressed it.
  const STEP_DESCRIPTION_KEYS = {
    phone: 'mfaSetup.phoneDescription',
    verify: 'mfaSetup.verifyDescription',
    backup: 'mfaSetup.backupDescription',
  } as const;
  const wrapperDescription = $derived(
    description !== undefined ? description : t(STEP_DESCRIPTION_KEYS[step]),
  );
  let phoneNumber = $state('');
  let code = $state('');
  let backupCode = $state<string | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let copied = $state(false);
  let resendCountdown = $state(0);
  let resendTimer: ReturnType<typeof setInterval> | null = null;

  function startResendCooldown() {
    resendCountdown = 60;
    if (resendTimer) clearInterval(resendTimer);
    resendTimer = setInterval(() => {
      resendCountdown--;
      if (resendCountdown <= 0) {
        if (resendTimer) clearInterval(resendTimer);
        resendTimer = null;
      }
    }, 1000);
  }

  async function handleSendCode() {
    if (loading) return;
    error = null;
    loading = true;
    try {
      await getBridgeAuth().setupMfa(phoneNumber);
      step = 'verify';
      startResendCooldown();
    } catch (err: any) {
      error = err.message || t('mfaSetup.error.sendCode');
      onError?.(err);
    } finally {
      loading = false;
    }
  }

  async function handleResendCode() {
    if (loading || resendCountdown > 0) return;
    error = null;
    loading = true;
    try {
      await getBridgeAuth().setupMfa(phoneNumber);
      code = '';
      startResendCooldown();
    } catch (err: any) {
      error = err.message || t('mfaSetup.error.resend');
      onError?.(err);
    } finally {
      loading = false;
    }
  }

  function goBackToPhone() {
    step = 'phone';
    code = '';
    error = null;
    resendCountdown = 0;
    if (resendTimer) clearInterval(resendTimer);
    resendTimer = null;
  }

  async function handleVerifyCode() {
    if (loading) return;
    error = null;
    loading = true;
    try {
      const result = await getBridgeAuth().confirmMfaSetup(code);
      backupCode = result.backupCode ?? null;
      step = 'backup';
    } catch (err: any) {
      error = err.message || t('mfa.error.invalidCode');
      onError?.(err);
    } finally {
      loading = false;
    }
  }

  async function copyBackupCode() {
    if (backupCode) {
      await navigator.clipboard.writeText(backupCode);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    }
  }

  async function handleDone() {
    // Complete the MFA setup flow (transitions auth state + auto-selects tenant)
    await getBridgeAuth().completeMfaSetup();
    onComplete?.();
  }
</script>

<AuthFormWrapper
  heading={t('mfaSetup.heading')}
  description={wrapperDescription}
  class={className}
  {style}
  {...rest}
>
  {#if error}
    <Alert variant="error">{error}</Alert>
  {/if}

  {#if step === 'phone'}
    <form onsubmit={(e) => { e.preventDefault(); handleSendCode(); }}>
      <div class="bridge-form-group">
        <label for="mfa-phone">{t('field.phoneNumber')}</label>
        <input
          id="mfa-phone"
          type="tel"
          placeholder={t('placeholder.phoneNumber')}
          bind:value={phoneNumber}
          disabled={loading}
        />
      </div>
      <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !phoneNumber.trim()}>
        {#if loading}<Spinner size={16} />{:else}{t('mfaSetup.sendCode')}{/if}
      </button>
    </form>

  {:else if step === 'verify'}
    <form onsubmit={(e) => { e.preventDefault(); handleVerifyCode(); }}>
      <div class="bridge-form-group">
        <label for="mfa-verify-code">{t('field.verificationCode')}</label>
        <input
          id="mfa-verify-code"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          placeholder={t('placeholder.sixDigitCode')}
          maxlength={6}
          bind:value={code}
          disabled={loading}
        />
      </div>
      <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || code.length < 6}>
        {#if loading}<Spinner size={16} />{:else}{t('mfaSetup.verify')}{/if}
      </button>
    </form>
    <p class="bridge-mfa-help">
      {#if resendCountdown > 0}
        {t('mfa.resendCountdown', { seconds: resendCountdown })}
      {:else}
        {t('mfa.resendPrompt')} <button type="button" class="bridge-link" onclick={handleResendCode} disabled={loading}>{t('action.resendCode')}</button>.
      {/if}
    </p>
    <button type="button" class="bridge-link" onclick={goBackToPhone}>{t('mfaSetup.changePhone')}</button>

  {:else if step === 'backup'}
    <Alert variant="success">{t('mfaSetup.successHeading')}</Alert>
    {#if backupCode}
      <div class="bridge-backup-code">
        <code>{backupCode}</code>
        <button type="button" class="bridge-btn bridge-btn-secondary" onclick={copyBackupCode}>
          {copied ? t('action.copied') : t('action.copy')}
        </button>
      </div>
    {/if}
    <button type="button" class="bridge-btn bridge-btn-primary" onclick={handleDone}>
      {t('action.done')}
    </button>
  {/if}
</AuthFormWrapper>
