<!--
  TBP-702 — the "Manage billing" button: opens the workspace's Stripe billing
  portal (payment method, invoices, cancel).

  The guides used to tell every app to hand-write this button around
  `getBridgeAuth().getBillingPortalUrl()`. It fetches a one-time portal URL at
  click time (the session is short-lived, so it is never cached) and follows it.

  Renders only for someone who can act on it: the workspace owner
  (`canManageBilling()`), on an app with payments on, whose workspace already has
  a plan — a plan-less workspace picks one first, it has nothing to manage.
-->
<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import { getBridgeAuth, isAuthenticated, subscriptionStore } from '../../../core/bridge-instance.js';
  import Alert from '../sdk-auth/shared/Alert.svelte';

  interface Props extends Omit<HTMLButtonAttributes, 'onclick'> {
    /** The button text. @default 'Manage billing' */
    label?: string;
  }

  let { label = 'Manage billing', class: className = '', ...rest }: Props = $props();

  let opening = $state(false);
  let failure = $state<string | null>(null);

  const status = $derived($subscriptionStore.status);

  // Read from the token, so re-read when the session or the subscription changes.
  const canManage = $derived.by(() => {
    if (!$isAuthenticated || !status) return false;
    try {
      return getBridgeAuth().canManageBilling();
    } catch {
      return false;
    }
  });

  const visible = $derived(canManage && !!status?.paymentsEnabled && !status?.shouldSelectPlan);

  async function openPortal() {
    opening = true;
    failure = null;
    try {
      window.location.href = await getBridgeAuth().getBillingPortalUrl();
    } catch (err) {
      failure = err instanceof Error ? err.message : 'Could not open the billing portal';
      opening = false;
    }
  }
</script>

{#if visible}
  {#if failure}
    <Alert variant="error">{failure}</Alert>
  {/if}
  <button
    type="button"
    class={`bridge-btn-secondary bridge-billing-portal-btn ${className}`}
    data-bridge-billing-portal
    disabled={opening}
    onclick={openPortal}
    {...rest}
  >
    {label}
  </button>
{/if}
