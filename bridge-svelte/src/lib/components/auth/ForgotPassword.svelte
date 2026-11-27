<!--
  Asks for a reset link. Bridge answers the same whether or not the address
  has an account, so the page always says the email is on its way.
  On an app set to codes it asks for a code instead: the code screen, then
  "Choose a new password" with the app's checklist, then "Password changed"
  with a way to sign in. A code reset never signs anyone in.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import { emailConfirmationOf, type EmailCodeStep, type PasswordResetToken } from '@nebulr-group/bridge-auth-core';
  import { getBridge, peekConfig } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import AuthFormWrapper from '../shared/AuthFormWrapper.svelte';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';
  import EmailCodeScreen from './EmailCodeScreen.svelte';
  import SetPassword from './SetPassword.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    heading?: string | null;
    headingSnippet?: Snippet;
    description?: string | null;
    loginHref?: string;
    onSent?: (email: string) => void;
    /** On an app set to codes: called once the new password is set. */
    onDone?: () => void;
    messages?: BridgeMessages;
  }

  let { heading = undefined, headingSnippet, description = undefined, loginHref = undefined, onSent, onDone, messages, class: className, style, ...rest }: Props = $props();

  const t = $derived(translator(messages));
  const authBase = peekConfig()?.authBase ?? '/auth';

  let email = $state('');
  let loading = $state(false);
  let sent = $state(false);
  let failure = $state<string | null>(null);
  /** On an app set to codes: the code screen, then the token to choose a new password with. */
  let codes = $state(false);
  let codeStep = $state<EmailCodeStep<PasswordResetToken> | null>(null);
  let resetToken = $state<string | null>(null);

  onMount(() => {
    getBridge()
      .signIn.options()
      .then((found) => (codes = emailConfirmationOf(found) === 'code'))
      .catch(() => undefined);
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (loading) return;
    failure = null;
    loading = true;
    try {
      const step = await getBridge().password.forgot(email.trim());
      if (step !== undefined) codeStep = step;
      else sent = true;
      onSent?.(email.trim());
    } catch (error) {
      failure = errorMessage(error, t, 'forgot.error.send');
    } finally {
      loading = false;
    }
  }
</script>

{#if resetToken !== null}
  <SetPassword token={resetToken} heading={t('forgot.chooseHeading')} doneHeading={t('forgot.changedHeading')} doneDescription={t('forgot.changedSignIn')} {loginHref} {onDone} class={className} {style} {messages} data-bridge-forgot-password="choose" />
{:else if codeStep !== null}
  <EmailCodeScreen
    email={codeStep.email}
    resendIn={codeStep.resendIn}
    verify={async (code) => {
      if (codeStep === null) return;
      resetToken = (await codeStep.verify(code)).token;
    }}
    resend={async () => {
      if (codeStep === null) return 60;
      codeStep = await codeStep.resend();
      return codeStep.resendIn;
    }}
    onBack={() => (codeStep = null)}
    class={className}
    {style}
    {messages}
    data-bridge-forgot-password="code"
  />
{:else}
<AuthFormWrapper
  heading={sent ? null : heading === undefined ? t('forgot.headingRequest') : heading}
  headingSnippet={sent ? undefined : headingSnippet}
  description={sent ? null : description === undefined ? (codes ? t('forgot.codeDescription') : t('forgot.description')) : description}
  class={className}
  {style}
  data-bridge-forgot-password={sent ? 'sent' : 'form'}
  {...rest}
>
  {#if failure}<Alert variant="error">{failure}</Alert>{/if}
  {#if sent}
    <Alert variant="success">{t('forgot.emailSent')}</Alert>
  {:else}
    <form onsubmit={submit}>
      <div class="bridge-form-group">
        <label for="forgot-email">{t('field.email')}</label>
        <input id="forgot-email" type="email" autocomplete="email" placeholder={t('placeholder.email')} required bind:value={email} disabled={loading} />
      </div>
      <button type="submit" class="bridge-btn bridge-btn-primary" disabled={loading || !email.trim()}>
        {#if loading}<Spinner size={16} />{:else}{codes ? t('forgot.sendCode') : t('forgot.submit')}{/if}
      </button>
    </form>
  {/if}
  <div class="bridge-form-footer">
    <a href={loginHref ?? `${authBase}/sign-in`} class="bridge-link">{t('action.backToSignIn')}</a>
  </div>
</AuthFormWrapper>
{/if}
