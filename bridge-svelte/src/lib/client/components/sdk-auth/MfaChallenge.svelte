<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import type { MessageOverrides } from '@nebulr-group/bridge-auth-core';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';
  import { getTranslator } from '../../stores/i18n.js';
  import { authErrorMessage } from './shared/auth-error.js';
  import AuthFormWrapper from './shared/AuthFormWrapper.svelte';
  import Spinner from './shared/Spinner.svelte';
  import Alert from './shared/Alert.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    onVerified?: () => void;
    onError?: (error: Error) => void;
    showRecoveryOption?: boolean;
    /** Per-key copy overrides for this component only (TBP-630). */
    messages?: MessageOverrides;
  }

  let {
    onVerified,
    onError,
    showRecoveryOption = true,
    messages,
    class: className,
    style,
    ...rest
  }: Props = $props();

  const t = $derived(getTranslator(messages));

  let code = $state('');
  let backupCode = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);
  let useRecovery = $state(false);
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

  async function handleResendCode() {
    if (loading || resendCountdown > 0) return;
    error = null;
    loading = true;
    try {
      await getBridgeAuth().resendMfaCode();
      code = '';
      startResendCooldown();
    } catch (err: any) {
      error = authErrorMessage(err, t, 'mfa.error.resend');
      onError?.(err);
    } finally {
      loading = false;
    }
  }

  async function handleVerify() {
    if (loading) return;
    error = null;
    loading = true;
    try {
      await getBridgeAuth().verifyMfa(code);
      onVerified?.();
    } catch (err: any) {
      error = authErrorMessage(err, t, 'mfa.error.invalidCode');
      onError?.(err);
    } finally {
      loading = false;
    }
  }

  async function handleRecovery() {
    if (loading) return;
    error = null;
    loading = true;
    try {
      await getBridgeAuth().resetMfa(backupCode);
      onVerified?.();
    } catch (err: any) {
      error = authErrorMessage(err, t, 'mfa.error.invalidRecoveryCode');
      onError?.(err);
    } finally {
      loading = false;
    }
  }
</script>

<AuthFormWrapper heading={t('mfa.challengeHeading')} class={className} {style} {...rest}>
  {#if error}
    <Alert variant="error">{error}</Alert>
  {/if}

  {#if !useRecovery}
    <form onsubmit={(e) => { e.preventDefault(); handleVerify(); }}>
      <div class="bridge-form-group">
        <label for="mfa-code">{t('field.authenticationCode')}</label>
        <input
          id="mfa-code"
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
        {#if loading}<Spinner size={16} />{:else}{t('mfa.submit')}{/if}
      </button>
    </form>
    <p class="bridge-mfa-help">
      {#if resendCountdown > 0}
        {t('mfa.resendCountdown', { seconds: resendCountdown })}
      {:else}
        {t('mfa.resendPrompt')} <button type="button" class="bridge-link" onclick={handleResendCode} disabled={loading}>{t('action.resendCode')}</button>.
      {/if}
    </p>
    {#if showRecoveryOption}
      <div class="bridge-form-footer">
        <button type="button" class="bridge-link" onclick={() => { useRecovery = true; error = null; }}>
          {t('mfa.useRecoveryCode')}
        </button>
      </div>
    {/if}
  {:else}
    <form onsubmit={(e) => { e.preventDefault(); handleRecovery(); }}>
      <div class="bridge-form-group">
        <label for="backup-code">{t('field.recoveryCode')}</label>
        <input
          id="backup-code"
          type="text"
          placeholder={t('placeholder.recoveryCode')}
          bind:value={backupCode}
          disabled={loading}
        />
      </div>
      <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !backupCode.trim()}>
        {#if loading}<Spinner size={16} />{:else}{t('mfa.recoverSubmit')}{/if}
      </button>
    </form>
    <div class="bridge-form-footer">
      <button type="button" class="bridge-link" onclick={() => { useRecovery = false; error = null; }}>
        {t('mfa.useAuthenticationCode')}
      </button>
    </div>
  {/if}
</AuthFormWrapper>
