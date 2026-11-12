<!--
  Hosted mode (`hosted` in the config), the sign-in page: starts a sign-in
  request at Bridge and sends the browser to the page Bridge hosts for the
  app. `HostedCallback` finishes it when the person comes back.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { readReturnTo, stashReturnTo } from '@nebulr-group/bridge-auth-core';
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
  let failure = $state<string | null>(null);

  onMount(async () => {
    try {
      const hosted = config?.hosted ?? {};
      const redirectUri = hosted.redirectUri ?? new URL(`${config?.authBase ?? '/auth'}/callback`, location.origin).toString();
      // Where to go once signed in survives the trip to Bridge's page, in this tab.
      stashReturnTo(readReturnTo(page.url, config?.returnToParam));
      location.assign(await getBridge().hosted.start({ redirectUri, ...(hosted.linkAddress === undefined ? {} : { linkAddress: hosted.linkAddress }) }));
    } catch (error) {
      failure = errorMessage(error, t, 'error.unavailable');
    }
  });
</script>

{#if failure === null}
  <AuthFormWrapper heading={null} data-bridge-hosted="starting">
    <div class="bridge-auth-settling" data-bridge-auth-settling>
      <Spinner size={24} />
    </div>
  </AuthFormWrapper>
{:else}
  <AuthFormWrapper heading={t('login.heading')} {headingSnippet} data-bridge-hosted="failed">
    <Alert variant="error">{failure}</Alert>
  </AuthFormWrapper>
{/if}
