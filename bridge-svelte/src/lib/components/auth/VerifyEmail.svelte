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
  import { offerSignUpLink, takeRelayedLink } from '../../core/link-relay.js';
  import AuthFormWrapper from '../shared/AuthFormWrapper.svelte';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';
  import WorkspaceChooser from './WorkspaceChooser.svelte';
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
    | { step: 'working' }
    | { step: 'continued' }
    | { step: 'signed-in'; to: string }
    | { step: 'workspace'; workspaces: readonly WorkspaceChoice[]; choose: (id: string) => Promise<SignInStep> }
    | { step: 'failed'; message: string; kind: string | null };
  let view = $state<State>({ step: 'working' });

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
    void start(found, relayed !== null);
  });

  async function start(found: string, relayed: boolean) {
    try {
      // The session belongs in the tab that started the sign-up (memory only): offer it the link first.
      if (!relayed && config?.storage === 'memory' && (await offerSignUpLink(config.issuer, found))) {
        view = { step: 'continued' };
        return;
      }
      await follow(await bounded(getBridge().signUp.finish(found)));
    } catch (error) {
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

{#if view.step === 'working'}
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
