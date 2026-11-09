<!--
  Where an invite email lands (`#bridge=invite&token=…`). It takes the token
  from the address, clears it, and shows which workspace the invite is for:

  - a person with no account signs up from the invite: no email to verify,
    and they land signed in, in the workspace;
  - a person with an account signs in, and the invite is accepted at once;
  - someone signed in already accepts with one button.

  An invite that no longer works says why: revoked, used or expired. One
  sent to another address says so, and offers to sign out. An issuer that
  does not offer invites gets a plain "not offered here yet".
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { isBridgeError, type InvitePreview } from '@nebulr-group/bridge-auth-core';
  import { getBridge, peekConfig } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { errorMessage, translator, type BridgeMessageKey } from '../../core/i18n.js';
  import { signedIn, user } from '../../core/stores.js';
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
    /** Called once the person is in the workspace. Without it, the page goes to `auth.afterSignIn`. */
    onAccepted?: () => void;
    messages?: BridgeMessages;
  }

  let { token = undefined, headingSnippet, onAccepted, messages, class: className, style, ...rest }: Props = $props();

  const t = $derived(translator(messages));
  const config = peekConfig();
  const authBase = config?.authBase ?? '/auth';

  type Closed = Exclude<InvitePreview['state'], 'open'>;
  type View =
    | { step: 'loading' }
    | { step: 'not-offered' }
    | { step: 'failed'; message: string }
    | { step: 'closed'; state: Closed }
    | { step: 'open'; token: string; workspace: string };
  let view = $state<View>({ step: 'loading' });
  /** `auth`: the sign-up or sign-in form. `accept`: signed in, accepting or about to. */
  let phase = $state<'auth' | 'accept'>('auth');
  let mode = $state<'sign-in' | 'sign-up'>('sign-up');
  let accepting = $state(false);
  let failure = $state<{ message: string; code: string | null } | null>(null);
  let notice = $state<string | null>(null);

  const CLOSED_COPY: Record<Closed, BridgeMessageKey> = {
    revoked: 'invite.state.revoked',
    used: 'invite.state.used',
    expired: 'invite.state.expired',
  };
  const CLOSED_CODES: Record<string, Closed> = { invite_revoked: 'revoked', invite_used: 'used', invite_expired: 'expired' };

  onMount(() => {
    const found = token ?? takeEmailLink('invite');
    if (found === null) {
      view = { step: 'failed', message: t('verify.missingLink') };
      return;
    }
    getBridge()
      .invites.preview(found)
      .then((preview) => {
        if (preview.state !== 'open') {
          view = { step: 'closed', state: preview.state };
          return;
        }
        view = { step: 'open', token: found, workspace: preview.workspace.name ?? '' };
        mode = preview.account ? 'sign-in' : 'sign-up';
        phase = get(signedIn) ? 'accept' : 'auth';
      })
      .catch((error) => {
        view = isBridgeError(error, 'not-offered') ? { step: 'not-offered' } : { step: 'failed', message: errorMessage(error, t, 'link.error.invalid') };
      });
  });

  function done() {
    if (onAccepted) onAccepted();
    else void goto(config?.afterSignIn ?? '/', { invalidateAll: true });
  }

  /** What to say about a refused invite call: the server's code first. */
  function refusal(error: unknown): { message: string; code: string | null } {
    const code = isBridgeError(error) ? error.code : null;
    if (code === 'invite_for_another_address') return { message: t('invite.wrongAddress'), code };
    if (code === 'already_member') return { message: t('invite.alreadyMember'), code };
    if (code === 'account_exists') return { message: t('invite.accountExists'), code };
    return { message: errorMessage(error, t, 'link.error.invalid'), code };
  }

  function closedBy(error: unknown): Closed | null {
    return isBridgeError(error, 'link-invalid') && error.code !== null ? (CLOSED_CODES[error.code] ?? null) : null;
  }

  async function accept() {
    if (view.step !== 'open' || accepting) return;
    phase = 'accept';
    accepting = true;
    failure = null;
    try {
      await getBridge().invites.accept(view.token);
      done();
    } catch (error) {
      const closed = closedBy(error);
      if (closed !== null) view = { step: 'closed', state: closed };
      else failure = refusal(error);
    } finally {
      accepting = false;
    }
  }

  function signUpFailed(error: unknown) {
    const closed = closedBy(error);
    if (closed !== null) {
      view = { step: 'closed', state: closed };
    } else if (isBridgeError(error) && error.code === 'account_exists') {
      // The address has an account after all: sign in, and the invite is accepted on the way.
      mode = 'sign-in';
      notice = t('invite.accountExists');
    }
  }

  async function signOut() {
    failure = null;
    await getBridge().signOut().catch(() => undefined);
    phase = 'auth';
    mode = 'sign-in';
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
{:else if view.step === 'closed'}
  <AuthFormWrapper heading={null} {headingSnippet} class={className} {style} data-bridge-invite="closed" data-invite-state={view.state} {...rest}>
    <Alert variant={view.state === 'used' ? 'info' : 'error'}>{t(CLOSED_COPY[view.state])}</Alert>
    <div class="bridge-form-footer">
      <a href={`${authBase}/sign-in`} class="bridge-link">{t('action.backToSignIn')}</a>
    </div>
  </AuthFormWrapper>
{:else if phase === 'accept'}
  <AuthFormWrapper
    heading={t('invite.heading', { workspace: view.workspace })}
    {headingSnippet}
    description={view.workspace ? t('invite.description', { workspace: view.workspace }) : null}
    class={className}
    {style}
    data-bridge-invite="accept"
    data-invite-error={failure?.code ?? null}
    {...rest}
  >
    {#if failure}<Alert variant="error">{failure.message}</Alert>{/if}
    {#if failure?.code === 'invite_for_another_address'}
      <button type="button" class="bridge-btn bridge-btn-primary" onclick={signOut}>{t('action.signOut')}</button>
    {:else if failure?.code === 'already_member'}
      <button type="button" class="bridge-btn bridge-btn-primary" onclick={done}>{t('invite.continue')}</button>
    {:else}
      {#if $user?.email}<p class="bridge-step-desc" data-bridge-invite-as>{t('invite.signedInAs', { email: $user.email })}</p>{/if}
      <button type="button" class="bridge-btn bridge-btn-primary" disabled={accepting} onclick={accept}>
        {#if accepting}<Spinner size={16} />{:else}{t('invite.accept')}{/if}
      </button>
    {/if}
  </AuthFormWrapper>
{:else}
  <AuthFormWrapper
    heading={t('invite.heading', { workspace: view.workspace })}
    {headingSnippet}
    description={mode === 'sign-up' ? t('invite.signUpToAccept') : t('invite.signInToAccept')}
    class={className}
    {style}
    data-bridge-invite={mode}
    {...rest}
  >
    {#if notice}<Alert variant="info">{notice}</Alert>{/if}
    {#if mode === 'sign-in'}
      <SignInForm heading={null} onSignIn={accept} {messages}>
        {#snippet footer()}
          <div class="bridge-form-footer">
            {t('login.signupPrompt')} <button type="button" class="bridge-link" onclick={() => ((mode = 'sign-up'), (notice = null))}>{t('login.signupLink')}</button>
          </div>
        {/snippet}
      </SignInForm>
    {:else}
      <SignUpForm heading={null} invite={view.token} onSignIn={done} onError={signUpFailed} {messages}>
        {#snippet footer()}
          <div class="bridge-form-footer">
            {t('signup.loginPrompt')} <button type="button" class="bridge-link" onclick={() => ((mode = 'sign-in'), (notice = null))}>{t('signup.loginLink')}</button>
          </div>
        {/snippet}
      </SignUpForm>
    {/if}
  </AuthFormWrapper>
{/if}
