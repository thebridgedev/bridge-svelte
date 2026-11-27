<!--
  Sets a new password from a reset link. It signs nobody in and ends every
  session of the account, so the page goes on to sign-in.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import { getBridge, peekConfig } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import AuthFormWrapper from '../shared/AuthFormWrapper.svelte';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';
  import PasswordInput from '../shared/PasswordInput.svelte';
  import PasswordChecklist from '../shared/PasswordChecklist.svelte';
  import type { PasswordRules } from '@nebulr-group/bridge-auth-core';
  import { checklistMet, checklistOf } from '../../core/password-rules.js';
  import { takeEmailLink } from './email-link.js';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** The reset link's token. @default read from the page's address */
    token?: string;
    heading?: string | null;
    headingSnippet?: Snippet;
    loginHref?: string;
    onDone?: () => void;
    messages?: BridgeMessages;
  }

  let { token = undefined, heading = undefined, headingSnippet, loginHref = undefined, onDone, messages, class: className, style, ...rest }: Props = $props();

  const t = $derived(translator(messages));
  const authBase = peekConfig()?.authBase ?? '/auth';

  let linkToken = $state<string | null>(null);
  let checked = $state(false);
  let password = $state('');
  let confirm = $state('');
  let rules = $state<PasswordRules | null>(null);
  const minLength = $derived(rules?.minLength ?? 8);
  let loading = $state(false);
  let done = $state(false);
  /** What the reset handed back to add one passkey on this browser (TBP-536), and how that went. */
  let afterReset = $state<{ readonly pass: string; readonly verifier: string } | null>(null);
  let passkey = $state<'offer' | 'working' | 'made' | 'failed' | null>(null);
  let failure = $state<string | null>(null);

  onMount(() => {
    linkToken = token ?? takeEmailLink('reset-password');
    checked = true;
    getBridge()
      .signIn.options()
      .then((found) => (rules = found.password ?? null))
      .catch(() => undefined);
  });

  /** One passkey on this browser, with what the reset handed back; signs nobody in. Never stops the way to sign-in. */
  async function addPasskey() {
    if (afterReset === null) return;
    passkey = 'working';
    try {
      await getBridge().passkeys.addAfterReset(afterReset);
      passkey = 'made';
    } catch {
      passkey = 'failed';
    }
    afterReset = null;
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (loading || linkToken === null) return;
    failure = null;
    if (password !== confirm) {
      failure = t('forgot.error.mismatch');
      return;
    }
    if (!checklistMet(checklistOf(rules, password))) {
      failure = [...password.normalize('NFKC')].length < minLength ? t('password.tooShort', { count: minLength }) : t('rules.heading');
      return;
    }
    loading = true;
    try {
      const answered = await getBridge().password.set(linkToken, password);
      afterReset = answered?.afterReset ?? null;
      passkey = afterReset !== null && getBridge().passkeys.supported !== undefined && (await getBridge().passkeys.supported()) ? 'offer' : null;
      done = true;
      onDone?.();
    } catch (error) {
      failure = errorMessage(error, t, 'forgot.error.update');
    } finally {
      loading = false;
    }
  }
</script>

{#if done && passkey === 'offer' && afterReset !== null}
  <AuthFormWrapper heading={t('forgot.successHeading')} description={t('passkey.afterReset')} class={className} {style} data-bridge-set-password="passkey-offer" {...rest}>
    <button type="button" class="bridge-btn bridge-btn-primary" data-bridge-passkey-offer-create onclick={addPasskey}>{t('passkey.create')}</button>
    <div class="bridge-form-footer">
      <button type="button" class="bridge-link" data-bridge-passkey-offer-later onclick={() => (passkey = null)}>{t('passkey.offerLater')}</button>
    </div>
  </AuthFormWrapper>
{:else if done}
  <AuthFormWrapper heading={t('forgot.successHeading')} description={t('forgot.setDone')} class={className} {style} data-bridge-set-password="done" {...rest}>
    {#if passkey === 'made'}<Alert variant="success">{t('passkey.offerDone')}</Alert>{/if}
    {#if passkey === 'failed'}<Alert variant="info">{t('passkey.offerFailed')}</Alert>{/if}
    <a href={loginHref ?? `${authBase}/sign-in`} class="bridge-btn bridge-btn-primary">{t('login.submit')}</a>
  </AuthFormWrapper>
{:else if checked && linkToken === null}
  <AuthFormWrapper heading={t('forgot.headingSet')} class={className} {style} data-bridge-set-password="missing" {...rest}>
    <Alert variant="error">{t('verify.missingLink')}</Alert>
    <div class="bridge-form-footer">
      <a href={`${authBase}/forgot-password`} class="bridge-link">{t('login.forgotPassword')}</a>
    </div>
  </AuthFormWrapper>
{:else}
  <AuthFormWrapper heading={heading === undefined ? t('forgot.headingSet') : heading} {headingSnippet} class={className} {style} data-bridge-set-password="form" {...rest}>
    {#if failure}<Alert variant="error">{failure}</Alert>{/if}
    <form onsubmit={submit}>
      <div class="bridge-form-group">
        <label for="set-password">{t('field.newPassword')}</label>
        <PasswordInput
          id="set-password"
          autocomplete="new-password"
          placeholder={t('placeholder.newPassword')}
          required
          bind:value={password}
          disabled={loading || !checked}
          aria-describedby="set-password-rules"
          showLabel={t('action.showPassword')}
          hideLabel={t('action.hidePassword')}
        />
        <PasswordChecklist id="set-password-rules" {rules} {password} {t} />
      </div>
      <div class="bridge-form-group">
        <label for="set-password-confirm">{t('field.confirmPassword')}</label>
        <PasswordInput
          id="set-password-confirm"
          autocomplete="new-password"
          placeholder={t('placeholder.confirmPassword')}
          required
          bind:value={confirm}
          disabled={loading || !checked}
          showLabel={t('action.showPassword')}
          hideLabel={t('action.hidePassword')}
        />
      </div>
      <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !checked || !password || !confirm}>
        {#if loading}<Spinner size={16} />{:else}{t('forgot.setSubmit')}{/if}
      </button>
    </form>
    <div class="bridge-form-footer">
      <a href={loginHref ?? `${authBase}/sign-in`} class="bridge-link">{t('action.backToSignIn')}</a>
    </div>
  </AuthFormWrapper>
{/if}
