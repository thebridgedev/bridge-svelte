<!--
  Signs out here, in every tab, and at Bridge, then goes to `redirectTo`
  (default `auth.afterSignOut`). Pass children for your own label.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import { goto } from '$app/navigation';
  import { signedOutTarget } from '@nebulr-group/bridge-auth-core';
  import { getBridge, peekConfig } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { translator } from '../../core/i18n.js';

  interface Props extends Omit<HTMLButtonAttributes, 'onclick'> {
    redirectTo?: string;
    onSignOut?: () => void;
    children?: Snippet;
    messages?: BridgeMessages;
  }

  let { redirectTo = undefined, onSignOut, children, messages, class: className, style, ...rest }: Props = $props();
  const t = $derived(translator(messages));
  let busy = $state(false);

  async function signOut() {
    if (busy) return;
    busy = true;
    // Where the person lands follows the app's "Users sign in" setting (TBP-871): Bridge's hosted page when they sign in there.
    const options = redirectTo === undefined && !onSignOut ? getBridge().signIn.options().catch(() => null) : Promise.resolve(null);
    try {
      await getBridge().signOut();
    } finally {
      busy = false;
    }
    if (onSignOut) {
      onSignOut();
      return;
    }
    const fallback = redirectTo ?? peekConfig()?.afterSignOut ?? '/';
    const target = redirectTo === undefined ? signedOutTarget(await options, fallback) : fallback;
    if (/^https?:\/\//.test(target) && new URL(target).origin !== location.origin) location.assign(target);
    else void goto(target, { invalidateAll: true });
  }
</script>

<button type="button" class={className} {style} data-bridge-sign-out data-loading={busy} disabled={busy} onclick={signOut} {...rest}>
  {#if children}{@render children()}{:else}{t('action.signOut')}{/if}
</button>
