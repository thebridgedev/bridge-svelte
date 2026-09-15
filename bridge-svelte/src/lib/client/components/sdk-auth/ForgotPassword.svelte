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
    token?: string;
    onComplete?: () => void;
    onError?: (error: Error) => void;
    loginHref?: string;
    /**
     * Override the built-in heading ("Set new password" / "Reset your password").
     * Pass `null`/`''` to render no heading and use your own page title.
     */
    heading?: string | null;
    /**
     * Step description. Pass `null`/`''` to render nothing and use your own
     * subtitle (TBP-631). Only ever shown on the send-link step; the set-password
     * and success states carry none.
     */
    description?: string | null;
    /** Per-key copy overrides for this component only (TBP-630). */
    messages?: MessageOverrides;
  }

  let {
    token,
    onComplete,
    onError,
    loginHref = '/login',
    heading = undefined,
    description = undefined,
    messages,
    class: className,
    style,
    ...rest
  }: Props = $props();

  const t = $derived(getTranslator(messages));

  let email = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);
  let emailSent = $state(false);
  let passwordReset = $state(false);
  let showPasswords = $state(false);

  const isSetMode = $derived(!!token);

  // In a success state ("Password set" / the email-sent alert) the form heading
  // is redundant, so suppress it. Otherwise use the override (if provided) or
  // the built-in, state-appropriate heading.
  const builtInHeading = $derived(
    isSetMode ? t('forgot.headingSet') : t('forgot.headingRequest'),
  );
  const wrapperHeading = $derived(
    passwordReset || emailSent ? null : heading !== undefined ? heading : builtInHeading,
  );

  // TBP-631 — same shape as the heading above: the description belongs to the
  // send-link step only. `undefined` means "not overridden" and falls through to
  // the built-in; `null` is an explicit suppression from the host and must be
  // respected, which is why this cannot collapse to `description ?? builtIn`.
  const wrapperDescription = $derived(
    isSetMode || passwordReset || emailSent
      ? null
      : description !== undefined
        ? description
        : t('forgot.description'),
  );

  async function handleSendLink() {
    if (loading) return;
    error = null;
    loading = true;
    try {
      await getBridgeAuth().sendResetPasswordLink(email);
      emailSent = true;
    } catch (err: any) {
      error = authErrorMessage(err, t, 'forgot.error.send');
      onError?.(err);
    } finally {
      loading = false;
    }
  }

  async function handleSetPassword() {
    if (loading) return;
    error = null;

    if (password !== confirmPassword) {
      error = t('forgot.error.mismatch');
      return;
    }

    if (password.length < 8) {
      error = t('forgot.error.tooShort');
      return;
    }

    loading = true;
    try {
      await getBridgeAuth().updatePassword(token!, password);
      passwordReset = true;
      onComplete?.();
    } catch (err: any) {
      error = authErrorMessage(err, t, 'forgot.error.update');
      onError?.(err);
    } finally {
      loading = false;
    }
  }
</script>

<AuthFormWrapper
  heading={wrapperHeading}
  description={wrapperDescription}
  class={className}
  {style}
  {...rest}
>
  {#if error}
    <Alert variant="error">{error}</Alert>
  {/if}

  {#if isSetMode}
    {#if passwordReset}
      <h2 class="bridge-success-heading">{t('forgot.successHeading')}</h2>
      <div class="bridge-form-footer">
        <a href={loginHref}>{t('action.backToLogin')}</a>
      </div>
    {:else}
      <form onsubmit={(e) => { e.preventDefault(); handleSetPassword(); }}>
        <div class="bridge-form-group">
          <label for="newPassword">{t('field.newPassword')}</label>
          <div class="bridge-password-wrapper">
            <input
              id="newPassword"
              type={showPasswords ? 'text' : 'password'}
              placeholder={t('placeholder.newPassword')}
              required
              bind:value={password}
              disabled={loading}
            />
            <button
              type="button"
              class="bridge-password-toggle"
              onclick={() => showPasswords = !showPasswords}
              tabindex={-1}
              aria-label={showPasswords ? t('action.hidePasswords') : t('action.showPasswords')}
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
          <label for="confirmPassword">{t('field.confirmPassword')}</label>
          <div class="bridge-password-wrapper">
            <input
              id="confirmPassword"
              type={showPasswords ? 'text' : 'password'}
              placeholder={t('placeholder.confirmPassword')}
              required
              bind:value={confirmPassword}
              disabled={loading}
            />
          </div>
        </div>
        <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !password}>
          {#if loading}<Spinner size={16} />{:else}{t('forgot.setSubmit')}{/if}
        </button>
      </form>
    {/if}
  {:else}
    {#if emailSent}
      <Alert variant="success">{t('forgot.emailSent')}</Alert>
      <div class="bridge-form-footer">
        <a href={loginHref}>{t('action.backToLogin')}</a>
      </div>
    {:else}
      <form onsubmit={(e) => { e.preventDefault(); handleSendLink(); }}>
        <div class="bridge-form-group">
          <label for="reset-email">{t('field.email')}</label>
          <input
            id="reset-email"
            type="email"
            placeholder={t('placeholder.email')}
            required
            bind:value={email}
            disabled={loading}
          />
        </div>
        <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !email.trim()}>
          {#if loading}<Spinner size={16} />{:else}{t('forgot.submit')}{/if}
        </button>
      </form>
      <div class="bridge-form-footer">
        <a href={loginHref}>{t('action.backToLogin')}</a>
      </div>
    {/if}
  {/if}
</AuthFormWrapper>
