<!--
  A sign-in that goes back to the person's own machine (localhost) on an app in production: Bridge asks for a click, so
  nothing sends the browser back by itself. The button goes back with the code.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { BridgeMessages } from '../../core/config.js';
  import { translator } from '../../core/i18n.js';
  import AuthFormWrapper from '../shared/AuthFormWrapper.svelte';
  import { safeReturn } from './finish-link.js';

  interface Props {
    /** Where the button goes: the app's registered return with the code. */
    url: string;
    headingSnippet?: Snippet;
    messages?: BridgeMessages;
    [rest: string]: unknown;
  }

  let { url, headingSnippet, messages, ...rest }: Props = $props();
  const t = $derived(translator(messages));
  const target = $derived(safeReturn(url));
</script>

<AuthFormWrapper heading={t('login.heading')} {headingSnippet} data-bridge-return="continue" {...rest}>
  <p>{t('return.hint')}</p>
  <button type="button" class="bridge-btn bridge-btn-primary" data-bridge-return-continue disabled={target === null} onclick={() => target !== null && location.assign(target)}>
    {t('return.continue')}
  </button>
</AuthFormWrapper>
