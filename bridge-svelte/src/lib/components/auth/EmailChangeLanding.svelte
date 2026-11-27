<!--
  Where the email change's links land, on the app's auth pages and Bridge's
  hosted page:

  - `email-change` (`#bridge=email-change&token=…`): the link in the current
    inbox, then the one in the new inbox. One button confirms, so a mail
    scanner that opens links confirms nothing. After the current inbox it
    says a link is on its way to the new address, in words that never say
    whether that address has an account; after the new inbox, that the change
    is done.
  - `email-revert` (`#bridge=email-revert&token=…`): "This wasn't me" in the
    notice to the old address. It puts the old address back, signs every
    device out, and a link to set a new password goes to the old address.

  Neither needs the person to be signed in. Each link works once.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import { isBridgeError } from '@nebulr-group/bridge-auth-core';
  import { getBridge, peekConfig } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import { me } from '../../core/stores.js';
  import AuthFormWrapper from '../shared/AuthFormWrapper.svelte';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';
  import { takeEmailLink } from './email-link.js';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** Which link: the confirmation, or "This wasn't me". */
    kind: 'email-change' | 'email-revert';
    /** The link's token. @default read from the page's address */
    token?: string;
    headingSnippet?: Snippet;
    /** Called once the link did its work. */
    onDone?: (result: { readonly kind: 'email-change' | 'email-revert'; readonly email?: string; readonly next?: string }) => void;
    onError?: (error: unknown) => void;
    messages?: BridgeMessages;
  }

  let { kind, token = undefined, headingSnippet, onDone, onError, messages, class: className, style, ...rest }: Props = $props();

  const t = $derived(translator(messages));
  const config = peekConfig();
  const authBase = config?.authBase ?? '/auth';

  type State = { step: 'ready' } | { step: 'working' } | { step: 'next' } | { step: 'done'; email: string } | { step: 'reverted' } | { step: 'failed'; message: string; kind: string | null };
  let view = $state<State>({ step: 'ready' });
  let found: string | null = null;

  onMount(() => {
    found = token ?? takeEmailLink(kind);
    if (found === null) view = { step: 'failed', message: t('verify.missingLink'), kind: null };
  });

  async function confirm() {
    if (found === null || view.step === 'working') return;
    view = { step: 'working' };
    try {
      if (kind === 'email-revert') {
        const answer = await getBridge().emailChange.revert(found);
        view = { step: 'reverted' };
        // Every device is signed out, this one too.
        if (getBridge().session.get().status === 'signed-in') await getBridge().signOut().catch(() => undefined);
        onDone?.({ kind, next: answer.next });
        return;
      }
      const answer = await getBridge().emailChange.confirm(found);
      if (answer.done) {
        view = { step: 'done', email: answer.email };
        if (getBridge().session.get().status === 'signed-in') void me.refresh();
        onDone?.({ kind, email: answer.email });
      } else {
        view = { step: 'next' };
        onDone?.({ kind, next: answer.next });
      }
    } catch (error) {
      view = { step: 'failed', message: errorMessage(error, t, 'link.error.invalid'), kind: isBridgeError(error) ? error.kind : null };
      onError?.(error);
    }
  }
</script>

<AuthFormWrapper
  heading={kind === 'email-revert' ? t('emailRevert.heading') : t('emailChange.heading')}
  {headingSnippet}
  class={className}
  {style}
  data-bridge-email-link={kind}
  data-bridge-email-link-step={view.step}
  data-error-kind={view.step === 'failed' ? view.kind : null}
  {...rest}
>
  {#if view.step === 'working'}
    <div class="bridge-auth-settling" data-bridge-auth-settling>
      <Spinner size={24} />
      <span>{t('emailChange.working')}</span>
    </div>
  {:else if view.step === 'next'}
    <Alert variant="success" data-bridge-email-link-result>{t('emailChange.next')}</Alert>
  {:else if view.step === 'done'}
    <Alert variant="success" data-bridge-email-link-result>{t('emailChange.done', { email: view.email })}</Alert>
  {:else if view.step === 'reverted'}
    <Alert variant="success" data-bridge-email-link-result>{t('emailRevert.done')}</Alert>
  {:else if view.step === 'failed'}
    <Alert variant="error">{view.message}</Alert>
  {:else}
    <p>{kind === 'email-revert' ? t('emailRevert.prompt') : t('emailChange.prompt')}</p>
    <button type="button" class="bridge-btn bridge-btn-primary" data-bridge-email-link-confirm onclick={confirm}>
      {kind === 'email-revert' ? t('emailRevert.confirm') : t('emailChange.confirm')}
    </button>
  {/if}
  <div class="bridge-form-footer">
    <a href={`${authBase}/sign-in`} class="bridge-link">{t('action.backToSignIn')}</a>
  </div>
</AuthFormWrapper>
