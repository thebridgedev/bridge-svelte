<!--
  A link that was used already, or has expired: says so clearly, with a way to get a new one.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { BridgeMessages } from '../../core/config.js';
  import { translator } from '../../core/i18n.js';
  import AuthFormWrapper from '../shared/AuthFormWrapper.svelte';
  import Alert from '../shared/Alert.svelte';
  import NoReferrer from '../shared/NoReferrer.svelte';

  interface Props {
    heading: string | null;
    headingSnippet?: Snippet;
    /** Which it is. */
    state: 'used' | 'expired';
    /** Where a new link is asked for. */
    href: string;
    messages?: BridgeMessages;
    [rest: string]: unknown;
  }

  let { heading, headingSnippet, state, href, messages, ...rest }: Props = $props();
  const t = $derived(translator(messages));
</script>

<NoReferrer />
<AuthFormWrapper {heading} {headingSnippet} data-bridge-link={state} {...rest}>
  <Alert variant="error">{state === 'used' ? t('link.used') : t('link.expired')}</Alert>
  <div class="bridge-form-footer">
    <a {href} class="bridge-link" data-bridge-link-new>{t('link.getNew')}</a>
  </div>
</AuthFormWrapper>
