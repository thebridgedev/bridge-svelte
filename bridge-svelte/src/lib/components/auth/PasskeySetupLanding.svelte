<!--
  Sets up a passkey from an emailed link, on the device that asked for it,
  then signs the person in. The browser's dialog opens only on a click, as
  Safari asks. Opened on another device it says so, and the link still works
  on the right one. The link works once.
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
    | { step: 'ready' }
    | { step: 'working' }
    | { step: 'unsupported' }
    | { step: 'workspace'; workspaces: readonly WorkspaceChoice[]; choose: (id: string) => Promise<SignInStep> }
    | { step: 'failed'; message: string; kind: string | null; again: boolean };
  let view = $state<State>({ step: 'ready' });
  let found: string | null = null;

  async function follow(step: SignInStep) {
    if (!step.done) {
      view = { step: 'workspace', workspaces: step.workspaces, choose: step.choose };
      return;
    }
    if (onSignIn) onSignIn();
    else await goto(config?.afterSignIn ?? '/', { invalidateAll: true });
  }

  function fail(error: unknown) {
    const kind = isBridgeError(error) ? error.kind : null;
    const message = kind === 'wrong-device' ? t('magicLink.wrongDevice') : kind === 'cancelled' ? t('passkey.cancelled') : errorMessage(error, t, 'link.error.invalid');
    // A closed dialog leaves the link unused: the person may try again.
    view = { step: 'failed', message, kind, again: kind === 'cancelled' };
    onError?.(error);
  }

  onMount(async () => {
    found = token ?? takeEmailLink('passkey-setup');
    if (found === null) view = { step: 'failed', message: t('verify.missingLink'), kind: null, again: false };
    else if (!(await getBridge().passkeys.supported())) view = { step: 'unsupported' };
  });

  async function create() {
    if (found === null) return;
    view = { step: 'working' };
    try {
      await follow(await getBridge().passkeys.setupLink.finish(found));
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
  <AuthFormWrapper heading={null} class={className} {style} data-bridge-passkey-setup="working" {...rest}>
    <div class="bridge-auth-settling" data-bridge-auth-settling>
      <Spinner size={24} />
      <span>{t('magicLink.finishing')}</span>
    </div>
  </AuthFormWrapper>
{:else if view.step === 'workspace'}
  <AuthFormWrapper heading={t('workspace.chooseHeading')} {headingSnippet} class={className} {style} data-bridge-passkey-setup="workspace" {...rest}>
    <WorkspaceChooser workspaces={view.workspaces} onChoose={choose} {messages} />
  </AuthFormWrapper>
{:else}
  <AuthFormWrapper heading={t('passkey.setupHeading')} {headingSnippet} class={className} {style} data-bridge-passkey-setup={view.step} data-error-kind={view.step === 'failed' ? view.kind : null} {...rest}>
    {#if view.step === 'unsupported'}
      <Alert variant="error">{t('passkey.unsupported')}</Alert>
    {:else if view.step === 'failed'}
      <Alert variant="error">{view.message}</Alert>
    {:else}
      <p>{t('passkey.setupPrompt')}</p>
    {/if}
    {#if view.step === 'ready' || (view.step === 'failed' && view.again)}
      <button type="button" class="bridge-btn bridge-btn-primary" data-bridge-passkey-create onclick={create}>{t('passkey.create')}</button>
    {/if}
    <div class="bridge-form-footer">
      <a href={`${authBase}/sign-in`} class="bridge-link">{t('action.backToSignIn')}</a>
    </div>
  </AuthFormWrapper>
{/if}
