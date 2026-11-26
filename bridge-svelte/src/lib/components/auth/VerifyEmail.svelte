<!--
  Finishes a sign-up from its email link, in the browser that started it, and
  signs the person in right here, in the tab the link opened, whichever
  storage the app uses. The tab that started the sign-up is told it finished
  (link-relay), and goes on signed in too, or says where the person is.
  Opened in another browser or on another device it says so, offers to sign
  up again here, and the link still works in the right browser.

  Every wait has a bound: finishing fails with an error after a while, and
  once signed in the page goes on, or offers a link when it cannot.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isBridgeError, type SignInStep, type WorkspaceChoice } from '@nebulr-group/bridge-auth-core';
  import { getBridge, peekConfig } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import { previewLink } from '../../core/link-preview.js';
  import { announceSignUpFinished } from '../../core/link-relay.js';
  import AuthFormWrapper from '../shared/AuthFormWrapper.svelte';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';
  import PasswordInput from '../shared/PasswordInput.svelte';
  import WorkspaceChooser from './WorkspaceChooser.svelte';
  import LinkConfirm from './LinkConfirm.svelte';
  import LinkGone from './LinkGone.svelte';
  import SecondStepForm from './SecondStepForm.svelte';
  import { takeEmailLink } from './email-link.js';
  import { bounded, handOff, leave } from './finish-link.js';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** The link's token. @default read from the page's address */
    token?: string;
    headingSnippet?: Snippet;
    /** Called once signed in. Without it, the page goes to `auth.afterSignIn`. */
    onSignIn?: () => void;
    onError?: (error: unknown) => void;
    messages?: BridgeMessages;
  }

  let { token = undefined, headingSnippet, onSignIn, onError, messages, class: className, style, ...rest }: Props = $props();

  const t = $derived(translator(messages));
  const config = peekConfig();
  const authBase = config?.authBase ?? '/auth';

  type State =
    | { step: 'checking' }
    | { step: 'confirm'; token: string }
    | { step: 'gone'; state: 'used' | 'expired' }
    | { step: 'working' }
    | { step: 'signed-in'; to: string }
    | { step: 'workspace'; workspaces: readonly WorkspaceChoice[]; choose: (id: string) => Promise<SignInStep> }
    | { step: 'second'; second: Extract<SignInStep, { next: 'second_step' } | { next: 'second_step_setup' }> }
    | { step: 'failed'; message: string; kind: string | null }
    | { step: 'password'; token: string; error: string | null; sending: boolean };
  let view = $state<State>({ step: 'checking' });

  async function finish() {
    if (onSignIn) {
      onSignIn();
      return;
    }
    // Signing in runs the route guard again, and that newer navigation can cancel this one: go again, then offer a link.
    const to = config?.afterSignIn ?? '/';
    const here = location.pathname;
    if (!(await leave(() => goto(to, { invalidateAll: true }), () => location.pathname !== here))) view = { step: 'signed-in', to };
  }

  /** auth-core's finish, with the password chosen at the link (from the release that takes it). */
  const finishSignUp = (link: string, password?: string): Promise<SignInStep> =>
    (getBridge().signUp.finish as (token: string, password?: string) => Promise<SignInStep>)(link, password);

  /** A sign-up started with no password: the person chooses it here, and the link is finished with it. */
  let chosen = $state('');

  async function choosePassword(event: SubmitEvent) {
    event.preventDefault();
    if (view.step !== 'password' || view.sending) return;
    const link = view.token;
    view = { ...view, sending: true, error: null };
    try {
      await follow(await bounded(finishSignUp(link, chosen)));
    } catch (error) {
      if (isBridgeError(error) && (error.code === 'password_rules' || error.code === 'password_required')) {
        view = { step: 'password', token: link, sending: false, error: errorMessage(error, t, 'password.tooShort') };
        return;
      }
      fail(error);
    }
  }

  function fail(error: unknown) {
    view = { step: 'failed', message: errorMessage(error, t, 'link.error.invalid'), kind: isBridgeError(error) ? error.kind : null };
    onError?.(error);
  }

  /** The sign-up is finished and signed in: the tab that started it stops waiting (link-relay). */
  function announce() {
    if (config?.issuer !== undefined) announceSignUpFinished(config.issuer);
  }

  async function follow(step: SignInStep) {
    if (step.done) announce();
    if (handOff(step)) view = { step: 'working' };
    else if (step.done) await finish();
    else if (step.next === 'workspace') view = { step: 'workspace', workspaces: step.workspaces, choose: step.choose };
    // A link never answers verify_email (only a social sign-up with an unconfirmed address does, on the sign-in form).
    else if (step.next !== 'verify_email') view = { step: 'second', second: step };
  }

  onMount(() => {
    // The token given, or the page's own address.
    const found = token ?? takeEmailLink('verify-email');
    if (found === null) {
      view = { step: 'failed', message: t('verify.missingLink'), kind: null };
      return;
    }
    // One button first: nothing is used up until it is pressed, so a mail scanner spoils nothing.
    void previewLink(found).then((state) => {
      view = state === 'open' ? { step: 'confirm', token: found } : { step: 'gone', state };
    });
  });

  function confirm() {
    if (view.step !== 'confirm') return;
    const found = view.token;
    view = { step: 'working' };
    void start(found);
  }

  async function start(found: string) {
    try {
      // Finished here, in the tab the link opened, and signed in here (owner, 24 Nov): no hand-off to the first tab.
      await follow(await bounded(finishSignUp(found)));
    } catch (error) {
      // Started with no password: the person chooses it now; the link stays usable.
      if (isBridgeError(error) && error.code === 'password_required') {
        view = { step: 'password', token: found, error: null, sending: false };
        return;
      }
      fail(error);
    }
  }

  async function choose(id: string) {
    if (view.step !== 'workspace') return;
    try {
      await follow(await view.choose(id));
    } catch (error) {
      fail(error);
    }
  }
</script>

{#if view.step === 'checking'}
  <AuthFormWrapper heading={null} class={className} {style} data-bridge-verify-email="checking" {...rest}>
    <div class="bridge-auth-settling" data-bridge-auth-settling>
      <Spinner size={24} />
      <span>{t('link.checking')}</span>
    </div>
  </AuthFormWrapper>
{:else if view.step === 'confirm'}
  <LinkConfirm heading={t('signup.heading')} {headingSnippet} label={t('link.button.verifyEmail')} onconfirm={confirm} {messages} class={className} {style} data-bridge-verify-email="confirm" {...rest} />
{:else if view.step === 'gone'}
  <LinkGone heading={t('signup.heading')} {headingSnippet} state={view.state} href={`${authBase}/sign-up`} {messages} class={className} {style} data-bridge-verify-email={view.state} {...rest} />
{:else if view.step === 'working'}
  <AuthFormWrapper heading={null} class={className} {style} data-bridge-verify-email="working" {...rest}>
    <div class="bridge-auth-settling" data-bridge-auth-settling>
      <Spinner size={24} />
      <span>{t('verify.finishing')}</span>
    </div>
  </AuthFormWrapper>
{:else if view.step === 'signed-in'}
  <AuthFormWrapper heading={t('signup.heading')} {headingSnippet} class={className} {style} data-bridge-verify-email="signed-in" {...rest}>
    <div class="bridge-form-footer">
      <a href={view.to} class="bridge-link">{t('invite.continue')}</a>
    </div>
  </AuthFormWrapper>
{:else if view.step === 'password'}
  <AuthFormWrapper heading={t('forgot.headingSet')} {headingSnippet} class={className} {style} data-bridge-verify-email="password" {...rest}>
    {#if view.error}
      <Alert variant="error">{view.error}</Alert>
    {/if}
    <form onsubmit={choosePassword}>
      <div class="bridge-form-group">
        <label for="verify-password">{t('field.newPassword')}</label>
        <PasswordInput
          id="verify-password"
          autocomplete="new-password"
          placeholder={t('placeholder.newPassword')}
          bind:value={chosen}
          showLabel={t('action.showPassword')}
          hideLabel={t('action.hidePassword')}
          disabled={view.sending}
          required
        />
      </div>
      <button type="submit" class="bridge-btn-primary" disabled={view.sending || chosen === ''}>
        {#if view.sending}<Spinner size={16} />{/if}
        {t('forgot.setSubmit')}
      </button>
    </form>
  </AuthFormWrapper>
{:else if view.step === 'second'}
  <SecondStepForm step={view.second} onStep={(next) => void follow(next)} class={className} {style} {messages} />
{:else if view.step === 'workspace'}
  <AuthFormWrapper heading={t('workspace.chooseHeading')} {headingSnippet} class={className} {style} data-bridge-verify-email="workspace" {...rest}>
    <WorkspaceChooser workspaces={view.workspaces} onChoose={choose} {messages} />
  </AuthFormWrapper>
{:else}
  <AuthFormWrapper heading={t('signup.heading')} {headingSnippet} class={className} {style} data-bridge-verify-email="failed" data-error-kind={view.kind} {...rest}>
    <Alert variant="error">{view.message}</Alert>
    {#if view.kind === 'wrong-device'}
      <!-- Another browser or device: signing up again here is the way on (the link still works where it started). -->
      <div class="bridge-form-footer">
        <a href={`${authBase}/sign-up`} class="bridge-link" data-bridge-verify-sign-up-again>{t('login.signupLink')}</a>
      </div>
    {/if}
    <div class="bridge-form-footer">
      <a href={`${authBase}/sign-in`} class="bridge-link">{t('action.backToSignIn')}</a>
    </div>
  </AuthFormWrapper>
{/if}
