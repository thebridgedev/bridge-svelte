<!--
  Finishes a sign-up from its email link, on the device that started it, and
  signs the person in. Opened on another device it says so, and the link
  still works on the right one.

  With `storage: 'memory'` the session lives only in the tab that started the
  sign-up, so this page first hands the link to that tab; when one takes it,
  this page says to go on there. When none does, this page finishes itself.
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
    | { step: 'workspace'; workspaces: readonly WorkspaceChoice[]; choose: (id: string) => Promise<SignInStep> }
    | { step: 'failed'; message: string; kind: string | null };
  let view = $state<State>({ step: 'working' });

  function finish() {
    if (onSignIn) onSignIn();
    else void goto(config?.afterSignIn ?? '/', { invalidateAll: true });
  }

  function fail(error: unknown) {
    view = { step: 'failed', message: errorMessage(error, t, 'link.error.invalid'), kind: isBridgeError(error) ? error.kind : null };
    onError?.(error);
  }

  async function follow(step: SignInStep) {
    if (step.done) finish();
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
    if (relayed === null && config?.storage === 'memory') {
      // The session belongs in the tab that started the sign-up: offer it the link first.
      void offerSignUpLink(config.issuer, found).then((taken) => {
        if (taken) view = { step: 'continued' };
        else getBridge().signUp.finish(found).then(follow, fail);
      });
      return;
    }
    getBridge().signUp.finish(found).then(follow, fail);
  });

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
