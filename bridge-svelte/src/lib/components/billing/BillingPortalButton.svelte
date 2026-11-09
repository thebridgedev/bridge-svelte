<!--
  "Manage billing": opens the workspace's billing portal (payment method,
  invoices, cancelling). The portal address is fetched on click, since it is
  short-lived. Renders only for a person with the `billingManage` flag.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import { getBridge } from '../../core/client.js';
  import { canManageBilling } from '../../core/flags.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import Alert from '../shared/Alert.svelte';

  interface Props extends Omit<HTMLButtonAttributes, 'onclick'> {
    /** The button text. @default 'Manage billing' */
    label?: string;
    /** Replaces the button text. */
    children?: Snippet;
  }

  let { label = 'Manage billing', children, class: className, style, ...rest }: Props = $props();

  const canManage = canManageBilling();
  let opening = $state(false);
  let failure = $state<string | null>(null);

  async function openPortal() {
    if (opening) return;
    opening = true;
    failure = null;
    try {
      const { url } = await getBridge().billing.portal();
      window.location.assign(url);
    } catch (error) {
      failure = errorMessage(error, translator(), 'error.generic');
      opening = false;
    }
  }
</script>

{#if $canManage}
  {#if failure}
    <Alert variant="error">{failure}</Alert>
  {/if}
  <button
    type="button"
    class={['bridge-btn-secondary', 'bridge-billing-portal-btn', className]}
    {style}
    data-bridge-billing-portal
    data-loading={opening}
    disabled={opening}
    onclick={openPortal}
    {...rest}
  >
    {#if children}{@render children()}{:else}{label}{/if}
  </button>
{/if}
