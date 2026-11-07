<!--
  Sign up with email and password. Nothing is made until the person proves
  the address: Bridge emails a link to the app's verify-email page, which
  finishes the sign-up on this device. The answer is the same whether or not
  the address already has an account, so the form never says which.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import type { SignInOptions } from '@nebulr-group/bridge-auth-core';
  import { getBridge, peekConfig } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import AuthFormWrapper from '../shared/AuthFormWrapper.svelte';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';
  import PasswordInput from '../shared/PasswordInput.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    heading?: string | null;
    headingSnippet?: Snippet;
    /** Ask for first and last name. @default true */
    showNameFields?: boolean;
    /**
     * The new person's own workspace: `true` makes one with no name yet,
     * `'ask'` asks for its name, `false` makes none. @default true
     */
    workspace?: boolean | 'ask';
    /** An invite to accept once the address is proved. */
    invite?: string;
    showLoginLink?: boolean;
    loginHref?: string;
    /** Called once the email is sent. */
    onSent?: (email: string) => void;
    onError?: (error: unknown) => void;
    footer?: Snippet;
    messages?: BridgeMessages;
  }

  let {
    heading = undefined,
    headingSnippet,
    showNameFields = true,
    workspace = true,
    invite = undefined,
    showLoginLink = true,
    loginHref = undefined,
    onSent,
    onError,
    footer,
    messages,
    class: className,
    style,
    ...rest
  }: Props = $props();

  const t = $derived(translator(messages));
  const authBase = peekConfig()?.authBase ?? '/auth';

  let email = $state('');
  let password = $state('');
  let firstName = $state('');
  let lastName = $state('');
  let workspaceName = $state('');
  let loading = $state(false);
  let failure = $state<string | null>(null);
  let sentTo = $state<string | null>(null);
  let options = $state<SignInOptions | null>(null);

  const minLength = $derived(options?.password.minLength ?? 8);
  const closed = $derived(options !== null && !options.signUp);

  onMount(() => {
    getBridge()
      .signIn.options()
      .then((found) => (options = found))
      .catch(() => undefined);
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (loading) return;
    failure = null;
    if (password.length < minLength) {
      failure = t('password.tooShort', { count: minLength });
      return;
    }
    loading = true;
    const address = email.trim();
    try {
      await getBridge().signUp.start({
        email: address,
        password,
        ...(firstName.trim() ? { firstName: firstName.trim() } : {}),
        ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
        ...(workspace === 'ask' ? { workspace: workspaceName.trim() || true } : workspace ? { workspace: true } : {}),
        ...(invite ? { invite } : {}),
      });
      sentTo = address;
      onSent?.(address);
    } catch (error) {
      failure = errorMessage(error, t, 'signup.error.create');
      onError?.(error);
    } finally {
      loading = false;
    }
  }
</script>

{#if sentTo !== null}
  <AuthFormWrapper heading={t('signup.successHeading')} class={className} {style} data-bridge-sign-up-step="sent" {...rest}>
    {#snippet descriptionSnippet()}
      <p class="bridge-step-desc" data-bridge-sign-up-sent>{t('signup.successDescription', { email: sentTo ?? '' })}</p>
    {/snippet}
  </AuthFormWrapper>
{:else if closed}
  <AuthFormWrapper heading={heading === undefined ? t('signup.heading') : heading} {headingSnippet} class={className} {style} data-bridge-sign-up-step="closed" {...rest}>
    <Alert variant="info">{t('signup.closed')}</Alert>
    <div class="bridge-form-footer">
      <a href={loginHref ?? `${authBase}/sign-in`} class="bridge-link">{t('action.backToSignIn')}</a>
    </div>
  </AuthFormWrapper>
{:else}
  <AuthFormWrapper heading={heading === undefined ? t('signup.heading') : heading} {headingSnippet} class={className} {style} data-bridge-sign-up-step="form" {...rest}>
    {#if failure}<Alert variant="error">{failure}</Alert>{/if}
    <form onsubmit={submit}>
      {#if showNameFields}
        <div class="bridge-form-row">
          <div class="bridge-form-group">
            <label for="signup-first-name">{t('field.firstName')}</label>
            <input id="signup-first-name" type="text" autocomplete="given-name" placeholder={t('placeholder.firstName')} bind:value={firstName} disabled={loading} />
          </div>
          <div class="bridge-form-group">
            <label for="signup-last-name">{t('field.lastName')}</label>
            <input id="signup-last-name" type="text" autocomplete="family-name" placeholder={t('placeholder.lastName')} bind:value={lastName} disabled={loading} />
          </div>
        </div>
      {/if}
      <div class="bridge-form-group">
        <label for="signup-email">{t('field.email')}</label>
        <input id="signup-email" type="email" autocomplete="email" placeholder={t('placeholder.email')} required bind:value={email} disabled={loading} />
      </div>
      <div class="bridge-form-group">
        <label for="signup-password">{t('field.password')}</label>
        <PasswordInput
          id="signup-password"
          autocomplete="new-password"
          placeholder={t('placeholder.newPassword')}
          required
          minlength={minLength}
          bind:value={password}
          disabled={loading}
          showLabel={t('action.showPassword')}
          hideLabel={t('action.hidePassword')}
        />
      </div>
      {#if workspace === 'ask'}
        <div class="bridge-form-group">
          <label for="signup-workspace">{t('field.workspaceName')}</label>
          <input id="signup-workspace" type="text" autocomplete="organization" bind:value={workspaceName} disabled={loading} />
        </div>
      {/if}
      <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !email.trim() || !password}>
        {#if loading}<Spinner size={16} />{:else}{t('signup.submit')}{/if}
      </button>
    </form>
    {#if footer}
      {@render footer()}
    {:else if showLoginLink}
      <div class="bridge-form-footer">
        {t('signup.loginPrompt')} <a href={loginHref ?? `${authBase}/sign-in`} class="bridge-link">{t('signup.loginLink')}</a>
      </div>
    {/if}
  </AuthFormWrapper>
{/if}
