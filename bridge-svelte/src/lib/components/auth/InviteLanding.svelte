<!--
  Where an invite email lands. It shows which workspace the invite is for,
  then lets the person accept it: at once when signed in, or by signing in or
  signing up with the invite. An issuer that does not offer invites yet gets
  a plain "not offered here yet" instead.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isBridgeError } from '@nebulr-group/bridge-auth-core';
  import { getBridge, peekConfig } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import { signedIn } from '../../core/stores.js';
  import AuthFormWrapper from '../shared/AuthFormWrapper.svelte';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';
  import SignInForm from './SignInForm.svelte';
  import SignUpForm from './SignUpForm.svelte';
  import { takeEmailLink } from './email-link.js';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** The invite's token. @default read from the page's address */
    token?: string;
    headingSnippet?: Snippet;
    /** Called once accepted. Without it, the page goes to `auth.afterSignIn`. */
    onAccepted?: () => void;
    messages?: BridgeMessages;
  }

  let { token = undefined, headingSnippet, onAccepted, messages, class: className, style, ...rest }: Props = $props();

  const t = $derived(translator(messages));
  const config = peekConfig();

  type View =
    | { step: 'loading' }
    | { step: 'not-offered' }
    | { step: 'failed'; message: string }
    | { step: 'ready'; token: string; workspace: string };
  let view = $state<View>({ step: 'loading' });
  let mode = $state<'sign-in' | 'sign-up'>('sign-in');
  let accepting = $state(false);
  let failure = $state<string | null>(null);

  function workspaceName(preview: unknown): string {
    const p = (preview ?? {}) as { workspace?: { name?: unknown } };
    return typeof p.workspace?.name === 'string' && p.workspace.name !== '' ? p.workspace.name : '';
  }

  onMount(() => {
    const found = token ?? takeEmailLink('invite');
    if (found === null) {
      view = { step: 'failed', message: t('verify.missingLink') };
      return;
    }
    getBridge()
      .invites.preview(found)
      .then((preview) => (view = { step: 'ready', token: found, workspace: workspaceName(preview) }))
      .catch((error) => {
        view = isBridgeError(error, 'not-offered') ? { step: 'not-offered' } : { step: 'failed', message: errorMessage(error, t, 'link.error.invalid') };
      });
  });

  function done() {
    if (onAccepted) onAccepted();
    else void goto(config?.afterSignIn ?? '/', { invalidateAll: true });
  }

  async function accept() {
    if (view.step !== 'ready' || accepting) return;
    accepting = true;
    failure = null;
    try {
      await getBridge().invites.accept(view.token);
      done();
    } catch (error) {
      failure = errorMessage(error, t, 'link.error.invalid');
    } finally {
      accepting = false;
    }
  }
</script>

{#if view.step === 'loading'}
  <AuthFormWrapper heading={null} class={className} {style} data-bridge-invite="loading" {...rest}>
    <div class="bridge-auth-settling" data-bridge-auth-settling><Spinner size={24} /></div>
  </AuthFormWrapper>
{:else if view.step === 'not-offered'}
  <AuthFormWrapper heading={null} {headingSnippet} class={className} {style} data-bridge-invite="not-offered" {...rest}>
    <Alert variant="info">{t('invite.notOffered')}</Alert>
  </AuthFormWrapper>
{:else if view.step === 'failed'}
  <AuthFormWrapper heading={null} {headingSnippet} class={className} {style} data-bridge-invite="failed" {...rest}>
    <Alert variant="error">{view.message}</Alert>
  </AuthFormWrapper>
{:else if $signedIn}
  <AuthFormWrapper
    heading={t('invite.heading', { workspace: view.workspace })}
    {headingSnippet}
    description={view.workspace ? t('invite.description', { workspace: view.workspace }) : null}
    class={className}
    {style}
    data-bridge-invite="accept"
    {...rest}
  >
    {#if failure}<Alert variant="error">{failure}</Alert>{/if}
    <button type="button" class="bridge-btn bridge-btn-primary" disabled={accepting} onclick={accept}>
      {#if accepting}<Spinner size={16} />{:else}{t('invite.accept')}{/if}
    </button>
  </AuthFormWrapper>
{:else}
  <AuthFormWrapper
    heading={t('invite.heading', { workspace: view.workspace })}
    {headingSnippet}
    description={t('invite.signInToAccept')}
    class={className}
    {style}
    data-bridge-invite={mode}
    {...rest}
  >
    {#if mode === 'sign-in'}
      <SignInForm heading={null} invite={view.token} onSignIn={done} {messages}>
        {#snippet footer()}
          <div class="bridge-form-footer">
            {t('login.signupPrompt')} <button type="button" class="bridge-link" onclick={() => (mode = 'sign-up')}>{t('login.signupLink')}</button>
          </div>
        {/snippet}
      </SignInForm>
    {:else}
      <SignUpForm heading={null} invite={view.token} {messages}>
        {#snippet footer()}
          <div class="bridge-form-footer">
            {t('signup.loginPrompt')} <button type="button" class="bridge-link" onclick={() => (mode = 'sign-in')}>{t('signup.loginLink')}</button>
          </div>
        {/snippet}
      </SignUpForm>
    {/if}
  </AuthFormWrapper>
{/if}
