<!--
  Hosted mode (`hosted` in the config), `<auth base>/callback`: where Bridge's
  hosted page sends the person back. It checks the return (its `state` and
  issuer) and trades the code with the verifier this browser kept, then goes
  on to where the person was going.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { takeReturnTo } from '@nebulr-group/bridge-auth-core';
  import { getBridge, peekConfig } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import AuthFormWrapper from '../shared/AuthFormWrapper.svelte';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';

  interface Props {
    headingSnippet?: Snippet;
    messages?: BridgeMessages;
  }

  let { headingSnippet, messages }: Props = $props();
  const t = $derived(translator(messages));
  const config = peekConfig();
  const authBase = config?.authBase ?? '/auth';
  let failure = $state<string | null>(null);

  onMount(async () => {
    const back = location.href;
    // The code and state leave the address bar and the history at once.
    history.replaceState(history.state, '', location.pathname);
    try {
      await getBridge().hosted.finish(back);
      await goto(takeReturnTo() ?? config?.afterSignIn ?? '/', { invalidateAll: true, replaceState: true });
    } catch (error) {
      failure = errorMessage(error, t, 'link.error.invalid');
    }
  });
</script>

{#if failure === null}
  <AuthFormWrapper heading={null} data-bridge-hosted="finishing">
    <div class="bridge-auth-settling" data-bridge-auth-settling>
      <Spinner size={24} />
    </div>
  </AuthFormWrapper>
{:else}
  <AuthFormWrapper heading={t('login.heading')} {headingSnippet} data-bridge-hosted="failed">
    <Alert variant="error">{failure}</Alert>
    <div class="bridge-form-footer">
      <a href={`${authBase}/sign-in`} class="bridge-link">{t('action.backToSignIn')}</a>
    </div>
  </AuthFormWrapper>
{/if}
