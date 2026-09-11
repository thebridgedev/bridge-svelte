<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import type { MessageOverrides } from '@nebulr-group/bridge-auth-core';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';
  import { getTranslator } from '../../stores/i18n.js';
  import AuthFormWrapper from './shared/AuthFormWrapper.svelte';
  import Spinner from './shared/Spinner.svelte';
  import Alert from './shared/Alert.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    onSent?: () => void;
    onError?: (error: Error) => void;
    loginHref?: string;
    /** Heading text. Pass `null`/`''` to render no heading and use your own page title. */
    heading?: string | null;
    /** Step description. Pass `null`/`''` to render nothing and use your own subtitle (TBP-631). */
    description?: string | null;
    /** Per-key copy overrides for this component only (TBP-630). */
    messages?: MessageOverrides;
  }

  let {
    onSent,
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

  // `undefined` means "not passed" and falls through to the catalogue; `null`
  // is an explicit suppression from the host and must survive (TBP-631), which
  // is why this cannot collapse to `heading ?? t(...)`.
  const wrapperHeading = $derived(heading !== undefined ? heading : t('magicLink.heading'));
  const wrapperDescription = $derived(
    description !== undefined ? description : t('magicLink.description'),
  );

  let email = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);
  let sent = $state(false);
  let expiresIn = $state(0);

  async function handleSend() {
    if (loading) return;
    error = null;
    loading = true;
    try {
      const result = await getBridgeAuth().sendMagicLink(email);
      expiresIn = result.expiresIn;
      sent = true;
      onSent?.();
    } catch (err: any) {
      error = err.message || t('magicLink.error.send');
      onError?.(err);
    } finally {
      loading = false;
    }
  }

  function formatExpiry(seconds: number): string {
    if (seconds >= 60) {
      const count = Math.floor(seconds / 60);
      return t(count === 1 ? 'magicLink.expiryMinute' : 'magicLink.expiryMinutes', { count });
    }
    return t('magicLink.expirySeconds', { count: seconds });
  }
</script>

<AuthFormWrapper
  heading={sent ? null : wrapperHeading}
  description={sent ? null : wrapperDescription}
  class={className}
  {style}
  {...rest}
>
  {#if error}
    <Alert variant="error">{error}</Alert>
  {/if}

  {#if sent}
    <Alert variant="success">
      {t('magicLink.sent', { expiry: formatExpiry(expiresIn) })}
    </Alert>
    {#if loginHref}
      <div class="bridge-form-footer">
        <a href={loginHref}>{t('action.backToLogin')}</a>
      </div>
    {/if}
  {:else}
    <form onsubmit={(e) => { e.preventDefault(); handleSend(); }}>
      <div class="bridge-form-group">
        <label for="magic-email">{t('field.email')}</label>
        <input
          id="magic-email"
          type="email"
          placeholder={t('placeholder.email')}
          required
          bind:value={email}
          disabled={loading}
        />
      </div>
      <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !email.trim()}>
        {#if loading}<Spinner size={16} />{:else}{t('magicLink.submit')}{/if}
      </button>
    </form>
    {#if loginHref}
      <div class="bridge-form-footer">
        <a href={loginHref}>{t('action.backToLogin')}</a>
      </div>
    {/if}
  {/if}
</AuthFormWrapper>
