<!--
  Sets a new password from a reset link. It signs nobody in and ends every
  session of the account, so the page goes on to sign-in.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import { getBridge, peekConfig } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import AuthFormWrapper from '../shared/AuthFormWrapper.svelte';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';
  import PasswordInput from '../shared/PasswordInput.svelte';
  import { takeEmailLink } from './email-link.js';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** The reset link's token. @default read from the page's address */
    token?: string;
    heading?: string | null;
    headingSnippet?: Snippet;
    loginHref?: string;
    onDone?: () => void;
    messages?: BridgeMessages;
  }

  let { token = undefined, heading = undefined, headingSnippet, loginHref = undefined, onDone, messages, class: className, style, ...rest }: Props = $props();

  const t = $derived(translator(messages));
  const authBase = peekConfig()?.authBase ?? '/auth';

  let linkToken = $state<string | null>(null);
  let checked = $state(false);
  let password = $state('');
  let confirm = $state('');
  let minLength = $state(8);
  let loading = $state(false);
  let done = $state(false);
  let failure = $state<string | null>(null);

  onMount(() => {
    linkToken = token ?? takeEmailLink('reset-password');
    checked = true;
    getBridge()
      .signIn.options()
      .then((found) => (minLength = found.password.minLength))
      .catch(() => undefined);
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (loading || linkToken === null) return;
    failure = null;
    if (password !== confirm) {
      failure = t('forgot.error.mismatch');
      return;
    }
    if (password.length < minLength) {
      failure = t('password.tooShort', { count: minLength });
      return;
    }
    loading = true;
    try {
      await getBridge().password.set(linkToken, password);
      done = true;
      onDone?.();
    } catch (error) {
      failure = errorMessage(error, t, 'forgot.error.update');
    } finally {
      loading = false;
    }
  }
</script>

{#if done}
  <AuthFormWrapper heading={t('forgot.successHeading')} description={t('forgot.setDone')} class={className} {style} data-bridge-set-password="done" {...rest}>
    <a href={loginHref ?? `${authBase}/sign-in`} class="bridge-btn bridge-btn-primary">{t('login.submit')}</a>
  </AuthFormWrapper>
{:else if checked && linkToken === null}
  <AuthFormWrapper heading={t('forgot.headingSet')} class={className} {style} data-bridge-set-password="missing" {...rest}>
    <Alert variant="error">{t('verify.missingLink')}</Alert>
    <div class="bridge-form-footer">
      <a href={`${authBase}/forgot-password`} class="bridge-link">{t('login.forgotPassword')}</a>
    </div>
  </AuthFormWrapper>
{:else}
  <AuthFormWrapper heading={heading === undefined ? t('forgot.headingSet') : heading} {headingSnippet} class={className} {style} data-bridge-set-password="form" {...rest}>
    {#if failure}<Alert variant="error">{failure}</Alert>{/if}
    <form onsubmit={submit}>
      <div class="bridge-form-group">
        <label for="set-password">{t('field.newPassword')}</label>
        <PasswordInput
          id="set-password"
          autocomplete="new-password"
          placeholder={t('placeholder.newPassword')}
          required
          bind:value={password}
          disabled={loading || !checked}
          showLabel={t('action.showPassword')}
          hideLabel={t('action.hidePassword')}
        />
      </div>
      <div class="bridge-form-group">
        <label for="set-password-confirm">{t('field.confirmPassword')}</label>
        <PasswordInput
          id="set-password-confirm"
          autocomplete="new-password"
          placeholder={t('placeholder.confirmPassword')}
          required
          bind:value={confirm}
          disabled={loading || !checked}
          showLabel={t('action.showPassword')}
          hideLabel={t('action.hidePassword')}
        />
      </div>
      <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !checked || !password || !confirm}>
        {#if loading}<Spinner size={16} />{:else}{t('forgot.setSubmit')}{/if}
      </button>
    </form>
    <div class="bridge-form-footer">
      <a href={loginHref ?? `${authBase}/sign-in`} class="bridge-link">{t('action.backToSignIn')}</a>
    </div>
  </AuthFormWrapper>
{/if}
