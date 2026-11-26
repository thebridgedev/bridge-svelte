<!--
  Sign in with email and password, or with a sign-in link sent by email (a
  magic link), then pick a workspace when the person has several. On success
  it calls `onSignIn`, or goes to the page the person was sent here from
  (else `auth.afterSignIn`).

  The form shows the methods the app's sign-in options list: the password
  fields when it offers passwords, "Email me a sign-in link" when it offers
  links, and "Sign in with a passkey" when it offers passkeys and the browser
  can use them. With passkeys, the email field also offers the person's
  passkeys in its autofill list, where the browser supports it; the button
  stays for a phone or a security key. The social providers the app offers
  show as "Continue with …" buttons; the provider's answer comes back to this
  page and is finished here. A workspace that requires a second step asks for
  the code texted to the person's phone (or a number to set up first, then
  shows the backup code once). Other methods (email codes, company login)
  arrive as new sign-in steps and join the same way.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { onDestroy, onMount } from 'svelte';
  import { continueOnAppPage, handOff, heldReturn } from './finish-link.js';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { isBridgeError, isPasswordChangeRequired, passkeyHandOver, readReturnTo, takeSocialReturn, type SignInOptions, type SignInStep, type WorkspaceChoice } from '@nebulr-group/bridge-auth-core';
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
  import ReturnContinue from './ReturnContinue.svelte';
  import SocialButtons from './SocialButtons.svelte';
  import SecondStepForm from './SecondStepForm.svelte';
  import CheckYourEmail from './CheckYourEmail.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** Heading on the credentials step. @default the shared "Log in to your account" copy; `null` for none */
    heading?: string | null;
    /** Replaces the heading on the credentials step only. */
    headingSnippet?: Snippet;
    /** Show the app's logo (from its App Properties in the dashboard) above the form. @default true; `false` when your page draws it itself */
    showLogo?: boolean;
    /** Show the sign-up link. @default whether the app's sign-in options allow sign-up */
    showSignupLink?: boolean;
    signupHref?: string;
    showForgotPassword?: boolean;
    forgotPasswordHref?: string;
    /** Sign straight in to this workspace. */
    workspace?: string;
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
    showLogo = true,
    showSignupLink = undefined,
    signupHref = undefined,
    showForgotPassword = true,
    forgotPasswordHref = undefined,
    workspace = undefined,
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
  let linkSent = $state(false);
  let options = $state<SignInOptions | null>(null);
  let choice = $state<{ workspaces: readonly WorkspaceChoice[]; choose: (id: string) => Promise<SignInStep> } | null>(null);
  let settled = $state(false);
  /** A finished sign-in whose return to the person's own machine waits for a click (a Continue button). */
  let heldBack = $state<string | null>(null);
  /** The right password that no longer meets the app's rules: a link to choose a new one was emailed. */
  let mustChoose = $state<'asked' | 'resent' | null>(null);
  /** The second step, while it waits for its code or a number. */
  let second = $state<Extract<SignInStep, { next: 'second_step' } | { next: 'second_step_setup' }> | null>(null);
  /** A social sign-up whose address the provider did not confirm: the address Bridge emailed its own link to. */
  let checkEmail = $state<string | null>(null);
  const social = $derived(options?.social ?? []);

  const signUpShown = $derived(showSignupLink ?? options?.signUp ?? true);
  const passwordOffered = $derived(options === null || options.methods.includes('password'));
  const linkOffered = $derived(options !== null && options.methods.includes('magicLink'));
  let passkeySupported = $state(false);
  let setupLinkSent = $state(false);
  const passkeysOffered = $derived(passkeySupported && options !== null && options.methods.includes('passkeys'));
  const passkeyHandOverTo = (error: unknown) => passkeyHandOver(error);
  const emailAutocomplete = $derived(passkeysOffered ? 'username webauthn' : 'username');
  let autofillStarted = false;

  /** Waits for the person to pick a passkey from the email field's autofill list. A closed list is not an error. */
  async function startAutofill() {
    const bridge = getBridge();
    if (autofillStarted || !(await bridge.passkeys.autofillSupported())) return;
    autofillStarted = true;
    try {
      await follow(await bridge.passkeys.signIn({ autofill: true, ...(workspace ? { workspace } : {}) }));
    } catch (error) {
      // Bridge's own page cannot offer a passkey (it belongs to the app's page): waiting for the list ends quietly.
      if (!isBridgeError(error, 'cancelled') && passkeyHandOverTo(error) === null) fail(error);
    }
  }

  onMount(() => {
    // Why the last session ended: told by the client as it happened, or read from the session on a fresh page.
    const now = get(session);
    const ended = takeEndedReason() ?? (now.status === 'signed-out' ? now.reason : null);
    if (ended === 'session-ended') notice = t('session.ended');
    if (ended === 'access-removed') notice = t('session.accessRemoved');
    const bridge = getBridge();
    // Back from a social provider: its answer finishes here, in the browser that started.
    const answer = takeSocialReturn();
    if (answer !== null) {
      loading = true;
      bridge.social
        .finish(answer)
        .then(follow)
        .catch((error: unknown) => (isBridgeError(error, 'cancelled') ? (notice = t('passkey.cancelled')) : fail(error)))
        .finally(() => (loading = false));
    }
    bridge.signIn
      .options()
      .then(async (found) => {
        options = found;
        if (!found.methods.includes('passkeys')) return;
        passkeySupported = await bridge.passkeys.supported();
        if (passkeySupported) void startAutofill();
      })
      .catch(() => undefined);
  });

  onDestroy(() => {
    // An autofill wait must not outlive the form.
    if (autofillStarted) void getBridge().passkeys.cancel();
  });

  /** Signs in with a passkey from the browser's dialog: a phone, a security key, or this device. */
  async function signInWithPasskey() {
    if (loading) return;
    failure = null;
    notice = null;
    loading = true;
    try {
      await follow(await getBridge().passkeys.signIn({ ...(email.trim() ? { email: email.trim() } : {}), ...(workspace ? { workspace } : {}) }));
    } catch (error) {
      if (isBridgeError(error, 'cancelled')) notice = t('passkey.cancelled');
      // On Bridge's own page a passkey belongs to the app's sign-in page: the person is taken there.
      else if (continueOnAppPage(error)) notice = t('passkey.handover');
      else fail(error);
    } finally {
      loading = false;
    }
  }

  /** Emails a link to set up a passkey on this device. The answer is the same whether or not the address has an account. */
  async function sendSetupLink() {
    if (loading || !email.trim()) return;
    failure = null;
    loading = true;
    try {
      await getBridge().passkeys.setupLink.request(email.trim());
      setupLinkSent = true;
    } catch (error) {
      fail(error);
    } finally {
      loading = false;
    }
  }

  function finish() {
    settled = true;
    if (onSignIn) {
      onSignIn();
      return;
    }
    const back = readReturnTo(page.url.href, config?.returnToParam);
    void goto(back ?? config?.afterSignIn ?? '/', { invalidateAll: true });
  }

  function fail(error: unknown) {
    failure = errorMessage(error, t, 'login.error.invalidCredentials');
    onError?.(error);
  }

  async function follow(step: SignInStep) {
    const held = heldReturn(step);
    if (held !== null) {
      heldBack = held;
      settled = true;
    } else if (handOff(step)) {
      settled = true;
    } else if (step.done) {
      finish();
    } else if (step.next === 'verify_email') {
      second = null;
      choice = null;
      checkEmail = step.email;
    } else if (step.next === 'workspace') {
      second = null;
      choice = { workspaces: step.workspaces, choose: step.choose };
    } else {
      choice = null;
      second = step;
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (loading) return;
    failure = null;
    notice = null;
    loading = true;
    try {
      await follow(await getBridge().signIn.start({ email: email.trim(), password, ...(workspace ? { workspace } : {}) }));
    } catch (error) {
      // The password is right, but the app's rules changed: a link to choose a new one is on its way.
      if (isPasswordChangeRequired(error)) mustChoose = 'asked';
      else fail(error);
    } finally {
      loading = false;
    }
  }

  /** Sends the link to choose a new password again. The answer is the same whether or not the address has an account. */
  async function resendChoose() {
    if (loading || !email.trim()) return;
    loading = true;
    try {
      await getBridge().password.forgot(email.trim());
      mustChoose = 'resent';
    } catch (error) {
      fail(error);
    } finally {
      loading = false;
    }
  }

  /** Asks for a sign-in link to the address typed. The answer is the same whether or not it has an account. */
  async function sendLink(event?: Event) {
    event?.preventDefault();
    if (loading || !email.trim()) return;
    failure = null;
    notice = null;
    loading = true;
    try {
      await getBridge().magicLink.start(email.trim());
      linkSent = true;
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

{#if heldBack !== null}
  <ReturnContinue url={heldBack} {messages} class={className} {style} {...rest} />
{:else if mustChoose !== null}
  <AuthFormWrapper heading={t('login.passwordChangeHeading')} class={className} {style} data-bridge-sign-in-step="password-change" {...rest}>
    {#if failure}<Alert variant="error">{failure}</Alert>{/if}
    <Alert variant="info">{mustChoose === 'resent' ? t('login.passwordChangeSent') : t('login.passwordChange')}</Alert>
    <button type="button" class="bridge-btn bridge-btn-secondary" data-bridge-password-change-resend onclick={resendChoose} disabled={loading}>
      {#if loading}<Spinner size={16} />{/if} {t('login.passwordChangeResend')}
    </button>
    <div class="bridge-form-footer">
      <a href={forgotPasswordHref ?? `${authBase}/forgot-password`} class="bridge-link">{t('login.forgotPassword')}</a>
    </div>
  </AuthFormWrapper>
{:else if settled}
  <AuthFormWrapper heading={null} class={className} {style} {...rest}>
    <div class="bridge-auth-settling" data-bridge-auth-settling>
      <Spinner size={24} />
      <span>{t('login.submitting')}</span>
    </div>
  </AuthFormWrapper>
{:else if checkEmail !== null}
  <CheckYourEmail email={checkEmail} {onSignIn} class={className} {style} {messages} />
{:else if second}
  <SecondStepForm step={second} onStep={(next) => void follow(next)} class={className} {style} {messages} />
{:else if choice}
  <AuthFormWrapper heading={t('workspace.chooseHeading')} class={className} {style} data-bridge-sign-in-step="workspace" {...rest}>
    <WorkspaceChooser workspaces={choice.workspaces} onChoose={choose} {messages} />
  </AuthFormWrapper>
{:else}
  <AuthFormWrapper
    heading={heading === undefined ? t('login.heading') : heading}
    {headingSnippet}
    logo={showLogo ? (options?.app.logo ?? null) : null}
    class={className}
    {style}
    data-bridge-sign-in-step="credentials"
    {...rest}
  >
    {#if notice}<Alert variant="info">{notice}</Alert>{/if}
    {#if failure}<Alert variant="error">{failure}</Alert>{/if}
    {#if setupLinkSent}
      <Alert variant="info">{t('passkey.setupLinkSent')}</Alert>
    {:else if linkSent}
      <Alert variant="info">{t('magicLink.sent')}</Alert>
    {:else if passwordOffered}
      <form onsubmit={submit}>
        <div class="bridge-form-group">
          <label for="login-email">{t('field.email')}</label>
          <input
            id="login-email"
            type="email"
            autocomplete={emailAutocomplete}
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
        {#if linkOffered}
          <div class="bridge-divider" data-bridge-sign-in-or>{t('magicLink.or')}</div>
          <button type="button" class="bridge-btn bridge-btn-secondary" data-bridge-magic-link-send onclick={sendLink} disabled={loading || !email.trim()}>
            {t('magicLink.send')}
          </button>
        {/if}
      </form>
    {:else if linkOffered}
      <form onsubmit={sendLink} data-bridge-magic-link-form>
        <div class="bridge-form-group">
          <label for="login-email">{t('field.email')}</label>
          <input
            id="login-email"
            type="email"
            autocomplete={emailAutocomplete}
            placeholder={t('placeholder.email')}
            required
            bind:value={email}
            disabled={loading}
          />
        </div>
        <button type="submit" class="bridge-btn bridge-btn-primary" data-bridge-magic-link-send disabled={loading || !email.trim()}>
          {#if loading}<Spinner size={16} />{/if} {t('magicLink.send')}
        </button>
      </form>
    {:else if passkeysOffered}
      <form onsubmit={(event) => { event.preventDefault(); void signInWithPasskey(); }} data-bridge-passkey-form>
        <div class="bridge-form-group">
          <label for="login-email">{t('field.email')}</label>
          <input id="login-email" type="email" autocomplete={emailAutocomplete} placeholder={t('placeholder.email')} bind:value={email} disabled={loading} />
        </div>
      </form>
    {/if}

    {#if passkeysOffered && !linkSent && !setupLinkSent}
      {#if passwordOffered || linkOffered}<div class="bridge-divider" data-bridge-sign-in-or>{t('magicLink.or')}</div>{/if}
      <button type="button" class="bridge-btn {passwordOffered || linkOffered ? 'bridge-btn-secondary' : 'bridge-btn-primary'}" data-bridge-passkey-sign-in onclick={signInWithPasskey} disabled={loading}>
        {t('passkey.signIn')}
      </button>
      <div class="bridge-forgot-row">
        <button type="button" class="bridge-link" data-bridge-passkey-setup-link onclick={sendSetupLink} disabled={loading || !email.trim()}>{t('passkey.setupLinkSend')}</button>
      </div>
    {/if}

    {#if social.length > 0 && !linkSent && !setupLinkSent}
      {#if passwordOffered || linkOffered || passkeysOffered}<div class="bridge-divider" data-bridge-sign-in-or>{t('magicLink.or')}</div>{/if}
      <SocialButtons providers={social} disabled={loading} onError={(message, error) => { failure = message; onError?.(error); }} {messages} />
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
