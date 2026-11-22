<!--
  The page an email link opens: one button. Nothing is used up until it is pressed, so a mail scanner that opens the
  link first spoils nothing. The label names what the button does ("Confirm my email", "Sign in").
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { BridgeMessages } from '../../core/config.js';
  import { translator } from '../../core/i18n.js';
  import AuthFormWrapper from '../shared/AuthFormWrapper.svelte';
  import NoReferrer from '../shared/NoReferrer.svelte';
  import Spinner from '../shared/Spinner.svelte';

  interface Props {
    heading: string | null;
    headingSnippet?: Snippet;
    label: string;
    busy?: boolean;
    onconfirm: () => void;
    messages?: BridgeMessages;
    [rest: string]: unknown;
  }

  let { heading, headingSnippet, label, busy = false, onconfirm, messages, ...rest }: Props = $props();
  const t = $derived(translator(messages));
</script>

<NoReferrer />
<AuthFormWrapper {heading} {headingSnippet} data-bridge-link="confirm" {...rest}>
  <p>{t('link.press')}</p>
  <button type="button" class="bridge-btn bridge-btn-primary" data-bridge-link-confirm disabled={busy} onclick={onconfirm}>
    {#if busy}<Spinner size={16} />{/if}
    {label}
  </button>
</AuthFormWrapper>
