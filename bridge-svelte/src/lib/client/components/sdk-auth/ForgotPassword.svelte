<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';
  import AuthFormWrapper from './shared/AuthFormWrapper.svelte';
  import Spinner from './shared/Spinner.svelte';
  import Alert from './shared/Alert.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    token?: string;
    onComplete?: () => void;
    onError?: (error: Error) => void;
    loginHref?: string;
  }

  let {
    token,
    onComplete,
    onError,
    loginHref = '/login',
    class: className,
    style,
    ...rest
  }: Props = $props();

  let email = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);
  let emailSent = $state(false);
  let passwordReset = $state(false);
  let showPasswords = $state(false);

  const isSetMode = $derived(!!token);

  async function handleSendLink() {
    if (loading) return;
    error = null;
    loading = true;
    try {
      await getBridgeAuth().sendResetPasswordLink(email);
      emailSent = true;
    } catch (err: any) {
      error = err.message || 'Failed to send reset link.';
      onError?.(err);
    } finally {
      loading = false;
    }
  }

  async function handleSetPassword() {
    if (loading) return;
    error = null;

    if (password !== confirmPassword) {
      error = 'Passwords do not match.';
      return;
    }

    if (password.length < 8) {
      error = 'Password must be at least 8 characters.';
      return;
    }

    loading = true;
    try {
      await getBridgeAuth().updatePassword(token!, password);
      passwordReset = true;
      onComplete?.();
    } catch (err: any) {
      error = err.message || 'Failed to update password.';
      onError?.(err);
    } finally {
      loading = false;
    }
  }
</script>

<AuthFormWrapper
  heading={isSetMode ? 'Set new password' : 'Reset your password'}
  class={className}
  {style}
  {...rest}
>
  {#if error}
    <Alert variant="error">{error}</Alert>
  {/if}

  {#if isSetMode}
    {#if passwordReset}
      <h2 class="bridge-success-heading">Password set</h2>
      <div class="bridge-form-footer">
        <a href={loginHref}>Back to login</a>
      </div>
    {:else}
      <form onsubmit={(e) => { e.preventDefault(); handleSetPassword(); }}>
        <div class="bridge-form-group">
          <label for="newPassword">New password</label>
          <div class="bridge-password-wrapper">
            <input
              id="newPassword"
              type={showPasswords ? 'text' : 'password'}
              placeholder="At least 8 characters"
              required
              bind:value={password}
              disabled={loading}
            />
            <button
              type="button"
              class="bridge-password-toggle"
              onclick={() => showPasswords = !showPasswords}
              tabindex={-1}
              aria-label={showPasswords ? 'Hide passwords' : 'Show passwords'}
            >
              {#if showPasswords}
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              {:else}
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              {/if}
            </button>
          </div>
        </div>
        <div class="bridge-form-group">
          <label for="confirmPassword">Confirm password</label>
          <div class="bridge-password-wrapper">
            <input
              id="confirmPassword"
              type={showPasswords ? 'text' : 'password'}
              placeholder="Repeat password"
              required
              bind:value={confirmPassword}
              disabled={loading}
            />
          </div>
        </div>
        <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !password}>
          {#if loading}<Spinner size={16} />{:else}Set a password{/if}
        </button>
      </form>
    {/if}
  {:else}
    {#if emailSent}
      <Alert variant="success">Check your email for a password reset link.</Alert>
      <div class="bridge-form-footer">
        <a href={loginHref}>Back to login</a>
      </div>
    {:else}
      <p class="bridge-step-desc">Enter your email and we'll send you a link to reset your password.</p>
      <form onsubmit={(e) => { e.preventDefault(); handleSendLink(); }}>
        <div class="bridge-form-group">
          <label for="reset-email">Email</label>
          <input
            id="reset-email"
            type="email"
            placeholder="you@example.com"
            required
            bind:value={email}
            disabled={loading}
          />
        </div>
        <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !email.trim()}>
          {#if loading}<Spinner size={16} />{:else}Send reset link{/if}
        </button>
      </form>
      <div class="bridge-form-footer">
        <a href={loginHref}>Back to login</a>
      </div>
    {/if}
  {/if}
</AuthFormWrapper>
