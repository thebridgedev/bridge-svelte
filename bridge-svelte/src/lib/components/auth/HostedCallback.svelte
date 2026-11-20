<!--
  Hosted mode (`hosted` in the config), `<auth base>/callback`: where Bridge's
  hosted page sends the person back. It checks the return (its `state` and
  issuer) and trades the code with the verifier this browser kept, then goes
  on to where the person was going. Opened by the hosted page with only `iss`
  (no request was started), it starts one of its own.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { takeReturnTo } from '@nebulr-group/bridge-auth-core';
  import { initiatedStep } from '../../core/initiated.js';
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
    // Bridge's hosted page, opened with no sign-in request, sent the browser here with this app's issuer: start an
    // ordinary sign-in of this app's own, with its own return, so it only ever finishes sign-ins it started. Not in
    // hosted mode, the app's own sign-in or sign-up page.
    const initiated = config ? initiatedStep(back, { issuer: config.issuer, authBase, hosted: config.hosted }) : null;
    if (initiated !== null) {
      history.replaceState(history.state, '', location.pathname);
      try {
        if (initiated.kind === 'own-page') {
          await goto(initiated.to, { replaceState: true });
          return;
        }
        const hosted = config?.hosted ?? {};
        const redirectUri = hosted.redirectUri ?? new URL(`${authBase}/callback`, location.origin).toString();
        location.replace(
          await getBridge().hosted.start({
            redirectUri,
            ...(hosted.linkAddress === undefined ? {} : { linkAddress: hosted.linkAddress }),
            page: initiated.page,
            ...(initiated.plan === null ? {} : { plan: initiated.plan }),
          }),
        );
      } catch (error) {
        failure = errorMessage(error, t, 'error.unavailable');
      }
      return;
    }
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
