<!--
  "Check your email" after a social sign-up with an address the provider did
  not confirm (Facebook): Bridge emailed its own link, as it does after a
  password sign-up, and the sign-up finishes when it is opened in this
  browser. This tab is told when another tab of the browser finished it, and
  goes on signed in too (or says so, when the session did not reach it).
  It is the same step SignUpForm shows once its link is sent.
-->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getBridge, peekConfig } from '../../core/client.js';
  import { onSignUpFinished } from '../../core/link-relay.js';
  import { session } from '../../core/stores.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { translator } from '../../core/i18n.js';
  import AuthFormWrapper from '../shared/AuthFormWrapper.svelte';
  import Alert from '../shared/Alert.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** The address Bridge emailed the link to. */
    email: string;
    /** Called once signed in. Without it, goes to the return address. */
    onSignIn?: () => void;
    messages?: BridgeMessages;
  }

  let { email, onSignIn, messages, class: className, style, ...rest }: Props = $props();

  const t = $derived(translator(messages));
  const config = peekConfig();
  let confirmed = $state(false);
  let stopRelay: (() => void) | null = null;
  let stopSession: (() => void) | null = null;

  onMount(() => {
    getBridge();
    if (config !== null && config !== undefined) {
      stopRelay = onSignUpFinished(config.issuer, () => {
        confirmed = true;
        stopSession?.();
        let left = false;
        stopSession = session.subscribe((state) => {
          if (left || state.status !== 'signed-in') return;
          left = true;
          if (onSignIn) onSignIn();
          else void goto(config.afterSignIn ?? '/', { invalidateAll: true });
        });
      });
    }
  });
  onDestroy(() => {
    stopRelay?.();
    stopSession?.();
  });
</script>

<AuthFormWrapper heading={t('signup.successHeading')} class={className} {style} data-bridge-sign-up-step="sent" {...rest}>
  {#snippet descriptionSnippet()}
    <p class="bridge-step-desc" data-bridge-sign-up-sent>{t('signup.successDescription', { email })}</p>
  {/snippet}
  {#if confirmed}
    <Alert variant="success" data-bridge-sign-up-confirmed>{t('signup.confirmedElsewhere')}</Alert>
  {/if}
</AuthFormWrapper>
