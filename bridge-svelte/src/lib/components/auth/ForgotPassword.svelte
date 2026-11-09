<!--
  Asks for a reset link. Bridge answers the same whether or not the address
  has an account, so the page always says the email is on its way.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { getBridge, peekConfig } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import AuthFormWrapper from '../shared/AuthFormWrapper.svelte';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    heading?: string | null;
    headingSnippet?: Snippet;
    description?: string | null;
    loginHref?: string;
    onSent?: (email: string) => void;
    messages?: BridgeMessages;
  }

  let { heading = undefined, headingSnippet, description = undefined, loginHref = undefined, onSent, messages, class: className, style, ...rest }: Props = $props();

  const t = $derived(translator(messages));
  const authBase = peekConfig()?.authBase ?? '/auth';

  let email = $state('');
  let loading = $state(false);
  let sent = $state(false);
  let failure = $state<string | null>(null);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (loading) return;
    failure = null;
    loading = true;
    try {
      await getBridge().password.forgot(email.trim());
      sent = true;
      onSent?.(email.trim());
    } catch (error) {
      failure = errorMessage(error, t, 'forgot.error.send');
    } finally {
      loading = false;
    }
  }
</script>

<AuthFormWrapper
  heading={sent ? null : heading === undefined ? t('forgot.headingRequest') : heading}
  headingSnippet={sent ? undefined : headingSnippet}
  description={sent ? null : description === undefined ? t('forgot.description') : description}
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
        {#if loading}<Spinner size={16} />{:else}{t('forgot.submit')}{/if}
      </button>
    </form>
  {/if}
  <div class="bridge-form-footer">
    <a href={loginHref ?? `${authBase}/sign-in`} class="bridge-link">{t('action.backToSignIn')}</a>
  </div>
</AuthFormWrapper>
