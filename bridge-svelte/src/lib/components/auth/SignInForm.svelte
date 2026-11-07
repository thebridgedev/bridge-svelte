<!--
  Sign in with email and password, then pick a workspace when the person has
  several. On success it calls `onSignIn`, or goes to the page the person was
  sent here from (else `auth.afterSignIn`).

  Today's method is password. Other methods (email codes, passkeys, company
  login, a second step) arrive as new sign-in steps; this form shows the
  methods the app's sign-in options list, so they join without a new API.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { readReturnTo, type SignInOptions, type SignInStep, type WorkspaceChoice } from '@nebulr-group/bridge-auth-core';
  import { get } from 'svelte/store';
  import { getBridge, peekConfig, takeEndedReason } from '../../core/client.js';
  import { session } from '../../core/stores.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import AuthFormWrapper from '../shared/AuthFormWrapper.svelte';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';
  import PasswordInput from '../shared/PasswordInput.svelte';
  import WorkspaceChooser from './WorkspaceChooser.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** Heading on the credentials step. @default the shared "Log in to your account" copy; `null` for none */
    heading?: string | null;
    /** Replaces the heading on the credentials step only. */
    headingSnippet?: Snippet;
    /** Show the sign-up link. @default whether the app's sign-in options allow sign-up */
    showSignupLink?: boolean;
    signupHref?: string;
    showForgotPassword?: boolean;
    forgotPasswordHref?: string;
    /** Sign straight in to this workspace. */
    workspace?: string;
    /** An invite to accept on the way in. */
    invite?: string;
    /** Called once signed in. Without it, the form goes to the return address. */
    onSignIn?: () => void;
    onError?: (error: unknown) => void;
    /** Replaces the sign-up line under the form. */
    footer?: Snippet;
    messages?: BridgeMessages;
  }

  let {
    heading = undefined,
    headingSnippet,
    showSignupLink = undefined,
    signupHref = undefined,
    showForgotPassword = true,
    forgotPasswordHref = undefined,
    workspace = undefined,
    invite = undefined,
    onSignIn,
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
  let loading = $state(false);
  let failure = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let options = $state<SignInOptions | null>(null);
  let choice = $state<{ workspaces: readonly WorkspaceChoice[]; choose: (id: string) => Promise<SignInStep> } | null>(null);
  let settled = $state(false);

  const signUpShown = $derived(showSignupLink ?? options?.signUp ?? true);
  const passwordOffered = $derived(options === null || options.methods.includes('password'));

  onMount(() => {
    // Why the last session ended: told by the client as it happened, or read from the session on a fresh page.
    const now = get(session);
    const ended = takeEndedReason() ?? (now.status === 'signed-out' ? now.reason : null);
    if (ended === 'session-ended') notice = t('session.ended');
    if (ended === 'access-removed') notice = t('session.accessRemoved');
    getBridge()
      .signIn.options()
      .then((found) => (options = found))
      .catch(() => undefined);
  });

  function finish() {
    settled = true;
    if (onSignIn) {
      onSignIn();
      return;
    }
    const back = readReturnTo(page.url, config?.returnToParam);
    void goto(back ?? config?.afterSignIn ?? '/', { invalidateAll: true });
  }

  function fail(error: unknown) {
    failure = errorMessage(error, t, 'login.error.invalidCredentials');
    onError?.(error);
  }

  async function follow(step: SignInStep) {
    if (step.done) {
      finish();
    } else {
      choice = { workspaces: step.workspaces, choose: step.choose };
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (loading) return;
    failure = null;
    notice = null;
    loading = true;
    try {
      await follow(await getBridge().signIn.start({ email: email.trim(), password, ...(workspace ? { workspace } : {}), ...(invite ? { invite } : {}) }));
    } catch (error) {
      fail(error);
    } finally {
      loading = false;
    }
  }

  async function choose(id: string) {
    if (choice === null) return;
    try {
      await follow(await choice.choose(id));
    } catch (error) {
      choice = null;
      fail(error);
    }
  }
</script>

{#if settled}
  <AuthFormWrapper heading={null} class={className} {style} {...rest}>
    <div class="bridge-auth-settling" data-bridge-auth-settling>
      <Spinner size={24} />
      <span>{t('login.submitting')}</span>
    </div>
  </AuthFormWrapper>
{:else if choice}
  <AuthFormWrapper heading={t('workspace.chooseHeading')} class={className} {style} data-bridge-sign-in-step="workspace" {...rest}>
    <WorkspaceChooser workspaces={choice.workspaces} onChoose={choose} {messages} />
  </AuthFormWrapper>
{:else}
  <AuthFormWrapper
    heading={heading === undefined ? t('login.heading') : heading}
    {headingSnippet}
    class={className}
    {style}
    data-bridge-sign-in-step="credentials"
    {...rest}
  >
    {#if notice}<Alert variant="info">{notice}</Alert>{/if}
    {#if failure}<Alert variant="error">{failure}</Alert>{/if}
    {#if passwordOffered}
      <form onsubmit={submit}>
        <div class="bridge-form-group">
          <label for="login-email">{t('field.email')}</label>
          <input
            id="login-email"
            type="email"
            autocomplete="username"
            placeholder={t('placeholder.email')}
            required
            bind:value={email}
            disabled={loading}
          />
        </div>
        <div class="bridge-form-group">
          <label for="login-password">{t('field.password')}</label>
          <PasswordInput
            id="login-password"
            autocomplete="current-password"
            placeholder={t('placeholder.password')}
            required
            bind:value={password}
            disabled={loading}
            showLabel={t('action.showPassword')}
            hideLabel={t('action.hidePassword')}
          />
        </div>
        <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !email.trim() || !password}>
          {#if loading}<Spinner size={16} /> {t('login.submitting')}{:else}{t('login.submit')}{/if}
        </button>
        {#if showForgotPassword}
          <div class="bridge-forgot-row">
            <a href={forgotPasswordHref ?? `${authBase}/forgot-password`} class="bridge-link">{t('login.forgotPassword')}</a>
          </div>
        {/if}
      </form>
    {/if}

    {#if footer}
      {@render footer()}
    {:else if signUpShown}
      <div class="bridge-form-footer">
        {t('login.signupPrompt')} <a href={signupHref ?? `${authBase}/sign-up`} class="bridge-link">{t('login.signupLink')}</a>
      </div>
    {/if}
  </AuthFormWrapper>
{/if}
