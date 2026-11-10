<!--
  Signs in from a sign-in link (a magic link), on the device that asked for
  it. Opened on another device it says so, and the link still works on the
  right one. The link works once: opened again, it says the link is no
  longer valid.
  With `storage: 'memory'` the verifier waited in localStorage, which every
  tab of the origin shares, so the tab the link opens in signs in itself and
  holds the session in its own memory.
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
    | { step: 'workspace'; workspaces: readonly WorkspaceChoice[]; choose: (id: string) => Promise<SignInStep> }
    | { step: 'failed'; message: string; kind: string | null };
  let view = $state<State>({ step: 'working' });

  function finish() {
    if (onSignIn) onSignIn();
    else void goto(config?.afterSignIn ?? '/', { invalidateAll: true });
  }

  function fail(error: unknown) {
    const kind = isBridgeError(error) ? error.kind : null;
    view = { step: 'failed', message: kind === 'wrong-device' ? t('magicLink.wrongDevice') : errorMessage(error, t, 'link.error.invalid'), kind };
    onError?.(error);
  }

  async function follow(step: SignInStep) {
    if (step.done) finish();
    else view = { step: 'workspace', workspaces: step.workspaces, choose: step.choose };
  }

  onMount(() => {
    const found = token ?? takeEmailLink('magic-link');
    if (found === null) {
      view = { step: 'failed', message: t('verify.missingLink'), kind: null };
      return;
    }
    getBridge().magicLink.finish(found).then(follow, fail);
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
  <AuthFormWrapper heading={null} class={className} {style} data-bridge-magic-link="working" {...rest}>
    <div class="bridge-auth-settling" data-bridge-auth-settling>
      <Spinner size={24} />
      <span>{t('magicLink.finishing')}</span>
    </div>
  </AuthFormWrapper>
{:else if view.step === 'workspace'}
  <AuthFormWrapper heading={t('workspace.chooseHeading')} {headingSnippet} class={className} {style} data-bridge-magic-link="workspace" {...rest}>
    <WorkspaceChooser workspaces={view.workspaces} onChoose={choose} {messages} />
  </AuthFormWrapper>
{:else}
  <AuthFormWrapper heading={t('login.heading')} {headingSnippet} class={className} {style} data-bridge-magic-link="failed" data-error-kind={view.kind} {...rest}>
    <Alert variant="error">{view.message}</Alert>
    <div class="bridge-form-footer">
      <a href={`${authBase}/sign-in`} class="bridge-link">{t('action.backToSignIn')}</a>
    </div>
  </AuthFormWrapper>
{/if}
