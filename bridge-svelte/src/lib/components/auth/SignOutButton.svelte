<!--
  Signs out here, in every tab, and at Bridge, then goes where you chose:

  - nothing set: the app's own sign-in page (`auth.afterSignOut`);
  - `redirectTo="/goodbye"`: another page, only on this page's address or one of `auth.appOrigins`; any other
    address is refused and the default is used;
  - `silent`: stay here, signed out, with no page reload, so your page shows its own signed-out view.

  The `signed-out` event reaches everything that listens in every case, and the session ends at Bridge, so a copied
  token stops working. Pass `onSignOut` to run your own code instead of going anywhere. Pass children for your own label.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import { getBridge } from '../../core/client.js';
  import type { BridgeMessages } from '../../core/config.js';
  import { translator } from '../../core/i18n.js';

  interface Props extends Omit<HTMLButtonAttributes, 'onclick'> {
    redirectTo?: string;
    /** Stay where the person is. */
    silent?: boolean;
    onSignOut?: () => void;
    children?: Snippet;
    messages?: BridgeMessages;
  }

  let { redirectTo = undefined, silent = false, onSignOut, children, messages, class: className, style, ...rest }: Props = $props();
  const t = $derived(translator(messages));
  let busy = $state(false);

  async function signOut() {
    if (busy) return;
    busy = true;
    try {
      // With your own `onSignOut` and no address, the page stays and your code decides what comes next.
      await getBridge().logout({ ...(redirectTo === undefined ? {} : { redirectTo }), ...(silent || (onSignOut !== undefined && redirectTo === undefined) ? { silent: true } : {}) });
    } finally {
      busy = false;
    }
    onSignOut?.();
  }
</script>

<button type="button" class={className} {style} data-bridge-sign-out data-loading={busy} disabled={busy} onclick={signOut} {...rest}>
  {#if children}{@render children()}{:else}{t('action.signOut')}{/if}
</button>
