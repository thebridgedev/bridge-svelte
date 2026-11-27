<!--
  The password the person signed in with appeared in a public data leak.

  On Warn they are signed in already: they can change it now (Bridge emails a
  link to set a new one) or go on with "Not now". On Refuse no session was
  made: the only way on is a new password, through the same link. The
  password itself never leaves Bridge; only a short piece of its hash is
  checked against the leak list.
-->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { getBridge } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import AuthFormWrapper from '../shared/AuthFormWrapper.svelte';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** The address the person signed in with: the link goes there. */
    email: string;
    /** `warn`: signed in, may skip. `refuse`: not signed in, must set a new password. */
    mode: 'warn' | 'refuse';
    /** On Warn: go on without changing it. */
    onNotNow?: () => void;
    messages?: BridgeMessages;
  }

  let { email, mode, onNotNow, messages, class: className, style, ...rest }: Props = $props();
  const t = $derived(translator(messages));

  let sending = $state(false);
  let sent = $state(false);
  let failure = $state<string | null>(null);

  async function sendLink() {
    if (sending) return;
    sending = true;
    failure = null;
    try {
      await getBridge().password.forgot(email);
      sent = true;
    } catch (error) {
      failure = errorMessage(error, t, 'forgot.error.send');
    } finally {
      sending = false;
    }
  }
</script>

<AuthFormWrapper heading={t('login.leaked.heading')} class={className} {style} data-bridge-sign-in-step="leaked-password" data-leaked-mode={mode} {...rest}>
  <Alert variant={mode === 'refuse' ? 'error' : 'info'}>{t(mode === 'refuse' ? 'login.leaked.refuse' : 'login.leaked.warn')}</Alert>
  {#if failure}<Alert variant="error">{failure}</Alert>{/if}
  {#if sent}
    <Alert variant="success" data-bridge-leaked-sent>{t('login.leaked.sent', { email })}</Alert>
  {:else}
    <button type="button" class="bridge-btn bridge-btn-primary" data-bridge-leaked-change onclick={sendLink} disabled={sending}>
      {#if sending}<Spinner size={16} />{/if}
      {t('login.leaked.change')}
    </button>
  {/if}
  {#if mode === 'warn'}
    <div class="bridge-forgot-row">
      <button type="button" class="bridge-link" data-bridge-leaked-not-now onclick={() => onNotNow?.()}>{sent ? t('invite.continue') : t('login.leaked.notNow')}</button>
    </div>
  {/if}
</AuthFormWrapper>
