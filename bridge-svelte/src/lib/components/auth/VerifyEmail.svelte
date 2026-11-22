<!--
  Finishes a sign-up from its email link, on the device that started it, and
  signs the person in. Opened on another device it says so, and the link
  still works on the right one.

  With `storage: 'memory'` the session lives only in the tab that started the
  sign-up, so this page first hands the link to that tab; when one takes it,
  this page says to go on there. When none does, this page finishes itself.

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
  import { offerSignUpLink, takeRelayedLink } from '../../core/link-relay.js';
  import AuthFormWrapper from '../shared/AuthFormWrapper.svelte';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';
  import PasswordInput from '../shared/PasswordInput.svelte';
  import WorkspaceChooser from './WorkspaceChooser.svelte';
  import LinkConfirm from './LinkConfirm.svelte';
  import LinkGone from './LinkGone.svelte';
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
    | { step: 'continued' }
    | { step: 'signed-in'; to: string }
    | { step: 'workspace'; workspaces: readonly WorkspaceChoice[]; choose: (id: string) => Promise<SignInStep> }
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

  async function follow(step: SignInStep) {
    if (handOff(step)) view = { step: 'working' };
    else if (step.done) await finish();
    else view = { step: 'workspace', workspaces: step.workspaces, choose: step.choose };
  }

  onMount(() => {
    // A link another tab handed here (memory only), the token given, or the page's own address.
    const relayed = token === undefined ? takeRelayedLink() : null;
    const found = token ?? relayed ?? takeEmailLink('verify-email');
    if (found === null) {
      view = { step: 'failed', message: t('verify.missingLink'), kind: null };
      return;
    }
    // A link another tab took from a page where the button was pressed is finished here as it comes. Any other link
    // shows one button first: nothing is used up until it is pressed, so a mail scanner spoils nothing.
    if (relayed !== null) {
      view = { step: 'working' };
      void start(found, true);
      return;
    }
    void previewLink(found).then((state) => {
      view = state === 'open' ? { step: 'confirm', token: found } : { step: 'gone', state };
    });
  });

  function confirm() {
    if (view.step !== 'confirm') return;
    const found = view.token;
    view = { step: 'working' };
    void start(found, false);
  }

  async function start(found: string, relayed: boolean) {
    try {
      // The session belongs in the tab that started the sign-up (memory only): offer it the link first.
      if (!relayed && config?.storage === 'memory' && (await offerSignUpLink(config.issuer, found))) {
        view = { step: 'continued' };
        return;
      }
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
{:else if view.step === 'continued'}
  <AuthFormWrapper heading={t('signup.heading')} {headingSnippet} class={className} {style} data-bridge-verify-email="continued" {...rest}>
    <Alert variant="info">{t('verify.continuedElsewhere')}</Alert>
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
{:else if view.step === 'workspace'}
  <AuthFormWrapper heading={t('workspace.chooseHeading')} {headingSnippet} class={className} {style} data-bridge-verify-email="workspace" {...rest}>
    <WorkspaceChooser workspaces={view.workspaces} onChoose={choose} {messages} />
  </AuthFormWrapper>
{:else}
  <AuthFormWrapper heading={t('signup.heading')} {headingSnippet} class={className} {style} data-bridge-verify-email="failed" data-error-kind={view.kind} {...rest}>
    <Alert variant="error">{view.message}</Alert>
    <div class="bridge-form-footer">
      <a href={`${authBase}/sign-in`} class="bridge-link">{t('action.backToSignIn')}</a>
    </div>
  </AuthFormWrapper>
{/if}
