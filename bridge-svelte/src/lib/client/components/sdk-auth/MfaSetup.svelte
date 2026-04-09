<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';
  import AuthFormWrapper from './shared/AuthFormWrapper.svelte';
  import Spinner from './shared/Spinner.svelte';
  import Alert from './shared/Alert.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    onComplete?: () => void;
    onError?: (error: Error) => void;
  }

  let {
    onComplete,
    onError,
    class: className,
    style,
    ...rest
  }: Props = $props();

  let step = $state<'phone' | 'verify' | 'backup'>('phone');
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
      error = err.message || 'Failed to send verification code.';
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
      error = err.message || 'Failed to resend verification code.';
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
      error = err.message || 'Invalid code. Please try again.';
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

<AuthFormWrapper heading="Set up two-factor authentication" class={className} {style} {...rest}>
  {#if error}
    <Alert variant="error">{error}</Alert>
  {/if}

  {#if step === 'phone'}
    <p class="bridge-step-desc">Enter your phone number to receive a verification code via SMS.</p>
    <form onsubmit={(e) => { e.preventDefault(); handleSendCode(); }}>
      <div class="bridge-form-group">
        <label for="mfa-phone">Phone number</label>
        <input
          id="mfa-phone"
          type="tel"
          placeholder="+1 (555) 000-0000"
          bind:value={phoneNumber}
          disabled={loading}
        />
      </div>
      <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !phoneNumber.trim()}>
        {#if loading}<Spinner size={16} />{:else}Send code{/if}
      </button>
    </form>

  {:else if step === 'verify'}
    <p class="bridge-step-desc">Enter the 6-digit code sent to your phone.</p>
    <form onsubmit={(e) => { e.preventDefault(); handleVerifyCode(); }}>
      <div class="bridge-form-group">
        <label for="mfa-verify-code">Verification code</label>
        <input
          id="mfa-verify-code"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          placeholder="Enter 6-digit code"
          maxlength={6}
          bind:value={code}
          disabled={loading}
        />
      </div>
      <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || code.length < 6}>
        {#if loading}<Spinner size={16} />{:else}Verify{/if}
      </button>
    </form>
    <p class="bridge-mfa-help">
      {#if resendCountdown > 0}
        Didn't get your text message? You can resend in {resendCountdown}s.
      {:else}
        Didn't get your text message? <button type="button" class="bridge-link" onclick={handleResendCode} disabled={loading}>Resend code</button>.
      {/if}
    </p>
    <button type="button" class="bridge-link" onclick={goBackToPhone}>Change phone number</button>

  {:else if step === 'backup'}
    <Alert variant="success">Two-factor authentication enabled!</Alert>
    <p class="bridge-step-desc">Save this recovery code in a safe place. You can use it to access your account if you lose your phone.</p>
    {#if backupCode}
      <div class="bridge-backup-code">
        <code>{backupCode}</code>
        <button type="button" class="bridge-btn bridge-btn-secondary" onclick={copyBackupCode}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    {/if}
    <button type="button" class="bridge-btn bridge-btn-primary" onclick={handleDone}>
      Done
    </button>
  {/if}
</AuthFormWrapper>
