<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';
  import AuthFormWrapper from './shared/AuthFormWrapper.svelte';
  import Spinner from './shared/Spinner.svelte';
  import Alert from './shared/Alert.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    onVerified?: () => void;
    onError?: (error: Error) => void;
    showRecoveryOption?: boolean;
  }

  let {
    onVerified,
    onError,
    showRecoveryOption = true,
    class: className,
    style,
    ...rest
  }: Props = $props();

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
      error = err.message || 'Failed to resend code.';
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
      error = err.message || 'Invalid code. Please try again.';
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
      error = err.message || 'Invalid recovery code.';
      onError?.(err);
    } finally {
      loading = false;
    }
  }
</script>

<AuthFormWrapper heading="Two-factor authentication" class={className} {style} {...rest}>
  {#if error}
    <Alert variant="error">{error}</Alert>
  {/if}

  {#if !useRecovery}
    <form onsubmit={(e) => { e.preventDefault(); handleVerify(); }}>
      <div class="bridge-form-group">
        <label for="mfa-code">Authentication code</label>
        <input
          id="mfa-code"
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
    {#if showRecoveryOption}
      <div class="bridge-form-footer">
        <button type="button" class="bridge-link" onclick={() => { useRecovery = true; error = null; }}>
          Use recovery code
        </button>
      </div>
    {/if}
  {:else}
    <form onsubmit={(e) => { e.preventDefault(); handleRecovery(); }}>
      <div class="bridge-form-group">
        <label for="backup-code">Recovery code</label>
        <input
          id="backup-code"
          type="text"
          placeholder="Enter recovery code"
          bind:value={backupCode}
          disabled={loading}
        />
      </div>
      <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !backupCode.trim()}>
        {#if loading}<Spinner size={16} />{:else}Recover{/if}
      </button>
    </form>
    <div class="bridge-form-footer">
      <button type="button" class="bridge-link" onclick={() => { useRecovery = false; error = null; }}>
        Use authentication code
      </button>
    </div>
  {/if}
</AuthFormWrapper>
