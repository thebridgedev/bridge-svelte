<!--
  Security settings, the second part of My profile: the password (a link to
  set a new one, sent to the person's own address) and passkeys, when the app
  offers them (`<PasskeyManager>`). Changing a passkey wants a recent sign-in;
  the "confirm it is you" dialog asks for it.

  `extra` is a place for more settings below these. Past "View as" sessions
  will go there once Bridge offers them: coming later, nothing shows yet.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import { getBridge } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import PasskeyManager from '../auth/PasskeyManager.svelte';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';

  interface Props extends HTMLAttributes<HTMLElement> {
    /** The address a password link goes to. */
    email: string;
    /** The language to show in. @default the app's */
    locale?: string | null;
    /** More settings, below the others (past "View as" sessions: coming later). */
    extra?: Snippet;
    onError?: (error: unknown) => void;
    messages?: BridgeMessages;
  }

  let { email, locale = undefined, extra, onError, messages, class: className, ...rest }: Props = $props();

  const t = $derived(translator(messages, locale));
  let methods = $state<readonly string[] | null>(null);
  let sending = $state(false);
  let sent = $state(false);
  let failure = $state<string | null>(null);

  onMount(() => {
    getBridge()
      .signIn.options()
      .then(
        (options) => (methods = options.methods),
        () => (methods = []),
      );
  });

  async function sendPasswordLink() {
    if (sending) return;
    sending = true;
    failure = null;
    try {
      await getBridge().password.forgot(email);
      sent = true;
    } catch (error) {
      failure = errorMessage(error, t);
      onError?.(error);
    } finally {
      sending = false;
    }
  }
</script>

<section class="bridge-profile-section {className ?? ''}" data-bridge-profile-security {...rest}>
  <h4 class="bridge-profile-section-title">{t('profile.security')}</h4>
  {#if methods === null}
    <Spinner size={16} />
  {:else}
    {#if methods.includes('password')}
      <div class="bridge-profile-setting" data-bridge-profile-password>
        <h5>{t('field.password')}</h5>
        {#if failure}<Alert variant="error">{failure}</Alert>{/if}
        {#if sent}
          <Alert variant="success" data-bridge-profile-password-sent>{t('profile.password.sent', { email })}</Alert>
        {:else}
          <p class="bridge-profile-hint">{t('profile.password.intro')}</p>
          <button type="button" class="bridge-btn bridge-btn-secondary" data-bridge-profile-password-send onclick={sendPasswordLink} disabled={sending}>
            {#if sending}<Spinner size={16} />{/if} {t('profile.password.send')}
          </button>
        {/if}
      </div>
    {/if}
    {#if methods.includes('passkeys')}
      <div class="bridge-profile-setting">
        <PasskeyManager {locale} {messages} {onError} />
      </div>
    {/if}
  {/if}
  {@render extra?.()}
</section>
