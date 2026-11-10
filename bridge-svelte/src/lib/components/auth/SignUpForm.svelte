<!--
  Sign up with email and password. Nothing is made until the person proves
  the address: Bridge emails a link to the app's verify-email page, which
  finishes the sign-up on this device. The answer is the same whether or not
  the address already has an account, so the form never says which.

  With `invite`, it signs the person up from an invite instead: the invite's
  link proved the address, so there is no email field and no email to wait
  for, and the person lands signed in, in the inviting workspace.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { SignInOptions } from '@nebulr-group/bridge-auth-core';
  import { getBridge, peekConfig } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import { takeSignUpLinks } from '../../core/link-relay.js';
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
    /**
     * An invite's token: sign the person up from the invite. The address is
     * the invite's, so no email field is shown and no email is sent.
     */
    invite?: string;
    /** With `invite`: called once signed in. Without it, the page goes to `auth.afterSignIn`. */
    onSignIn?: () => void;
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
    onSignIn,
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
  const config = peekConfig();
  const authBase = config?.authBase ?? '/auth';

  let email = $state('');
  let password = $state('');
  let firstName = $state('');
  let lastName = $state('');
  let workspaceName = $state('');
  let loading = $state(false);
  let failure = $state<string | null>(null);
  let sentTo = $state<string | null>(null);
  let options = $state<SignInOptions | null>(null);

  const minLength = $derived(options?.password?.minLength ?? 8);
  /** An app that offers sign-in links only takes no password: the person signs in by link. */
  const passwordOffered = $derived(options === null || options.methods.includes('password'));
  // An invite is its own way in, whether or not the app takes sign-ups.
  const closed = $derived(!invite && options !== null && !options.signUp);
  let stopRelay: (() => void) | null = null;
  onDestroy(() => stopRelay?.());

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
    if (passwordOffered && password.length < minLength) {
      failure = t('password.tooShort', { count: minLength });
      return;
    }
    loading = true;
    const secret = passwordOffered ? { password } : {};
    const address = email.trim();
    const names = {
      ...(firstName.trim() ? { firstName: firstName.trim() } : {}),
      ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
    };
    try {
      if (invite) {
        // Signed in at once, in the inviting workspace: the invite's link proved the address.
        await getBridge().invites.signUp({ token: invite, ...secret, ...names });
        if (onSignIn) onSignIn();
        else void goto(config?.afterSignIn ?? '/', { invalidateAll: true });
        return;
      }
      await getBridge().signUp.start({
        email: address,
        ...secret,
        ...names,
        ...(workspace === 'ask' ? { workspace: workspaceName.trim() || true } : workspace ? { workspace: true } : {}),
      });
      sentTo = address;
      onSent?.(address);
      // Memory only: this tab holds the sign-up's verifier, and the email link opens in a new tab, which hands it here.
      if (config?.storage === 'memory' && stopRelay === null) {
        stopRelay = takeSignUpLinks(config.issuer, () => void goto(`${authBase}/verify-email`));
      }
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
      {#if !invite}
        <div class="bridge-form-group">
          <label for="signup-email">{t('field.email')}</label>
          <input id="signup-email" type="email" autocomplete="email" placeholder={t('placeholder.email')} required bind:value={email} disabled={loading} />
        </div>
      {/if}
      {#if passwordOffered}
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
      {/if}
      {#if workspace === 'ask' && !invite}
        <div class="bridge-form-group">
          <label for="signup-workspace">{t('field.workspaceName')}</label>
          <input id="signup-workspace" type="text" autocomplete="organization" bind:value={workspaceName} disabled={loading} />
        </div>
      {/if}
      <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || (!invite && !email.trim()) || (passwordOffered && !password)}>
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
