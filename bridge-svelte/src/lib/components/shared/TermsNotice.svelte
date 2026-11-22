<!--
  "By continuing you accept [app]'s Terms of Service and Privacy Policy", linked to the app's own pages. Shown by the
  forms where an account can be made, when the app's sign-in options list `signUpNotice`: the app can switch the line
  off, and it is not shown while the app has only placeholder pages. A line, not a checkbox. Follows the app's
  language and the page's link colours.
-->
<script lang="ts">
  import type { SignInOptions } from '@nebulr-group/bridge-auth-core';
  import type { BridgeMessages } from '../../core/config.js';
  import { translator } from '../../core/i18n.js';
  import { safePage, termsParts } from '../../core/terms.js';

  interface Props {
    /** The sign-in options' `signUpNotice`: the app's two pages. Nothing is shown without it. */
    notice?: SignInOptions['signUpNotice'] | null;
    /** The app's name, from its profile; the line leaves it out when the app has none. */
    appName?: string | null;
    messages?: BridgeMessages;
  }

  let { notice = undefined, appName = undefined, messages }: Props = $props();

  const t = $derived(translator(messages));
  const parts = $derived.by(() => {
    if (notice === undefined || notice === null) return [];
    const name = typeof appName === 'string' ? appName.trim() : '';
    // The two links keep their braces here, so the sentence can be split around them.
    const sentence = name === '' ? t('terms.noticeNoApp', { terms: '{terms}', privacy: '{privacy}' }) : t('terms.notice', { app: name, terms: '{terms}', privacy: '{privacy}' });
    return termsParts(sentence, { terms: t('terms.terms'), privacy: t('terms.privacy') });
  });
  const pages = $derived({ terms: safePage(notice?.terms), privacy: safePage(notice?.privacy) });
</script>

{#if parts.length > 0}
  <p class="bridge-terms-notice" data-bridge-terms-notice>
    {#each parts as part}{#if 'text' in part}{part.text}{:else if pages[part.link] !== null}<a class="bridge-link" href={pages[part.link]} target="_blank" rel="noopener noreferrer" data-bridge-terms-link={part.link}>{part.label}</a>{:else}{part.label}{/if}{/each}
  </p>
{/if}
