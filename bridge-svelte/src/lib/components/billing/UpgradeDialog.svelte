<!--
  The dialog a plan limit or a missing plan feature opens. `<BridgeBootstrap>`
  renders it whenever a request is open (a 402 through `bridgeFetch`, or an
  upgrade prompt). A person who may manage billing (the `billingManage` flag)
  gets a link to the plan page; anyone else is told to ask the owner.
-->
<script lang="ts">
  import type { HTMLDialogAttributes } from 'svelte/elements';
  import { sanitizeReturnTo } from '@nebulr-group/bridge-auth-core';
  import type { UpgradeDialogProps } from '../../core/upgrade.js';

  interface Props extends UpgradeDialogProps, Omit<HTMLDialogAttributes, 'onclose'> {}

  let { request, upgradeHref, canUpgrade, onclose, class: className, style, ...rest }: Props = $props();

  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (dialog && !dialog.open) dialog.showModal();
  });

  const hasNumbers = $derived(typeof request.used === 'number' && typeof request.limit === 'number');
  // A link from the request is used only when it is a path on this site.
  const href = $derived(sanitizeReturnTo(request.upgradeHref) ?? upgradeHref);
</script>

<dialog
  bind:this={dialog}
  class={['bridge-team-dialog', 'bridge-upgrade-dialog', className]}
  {style}
  data-bridge-upgrade-dialog
  data-variant={request.kind}
  data-metric={request.metric ?? undefined}
  data-feature={request.entitlement ?? request.flag ?? undefined}
  aria-labelledby="bridge-upgrade-dialog-title"
  onclose={() => onclose()}
  {...rest}
>
  <div class="bridge-team-dialog-content">
    {#if request.kind === 'feature'}
      <h3 id="bridge-upgrade-dialog-title" class="bridge-team-dialog-title">This feature isn't on your plan</h3>
      <p class="bridge-team-dialog-message" data-bridge-upgrade-dialog-message data-variant={canUpgrade ? 'admin' : 'member'}>
        {canUpgrade ? 'Upgrade the plan to use it.' : 'Ask the workspace owner to upgrade the plan to use it.'}
      </p>
    {:else}
      <h3 id="bridge-upgrade-dialog-title" class="bridge-team-dialog-title">You've reached your plan's limit</h3>
      <p class="bridge-team-dialog-message" data-bridge-upgrade-dialog-message data-variant={canUpgrade ? 'admin' : 'member'}>
        {#if hasNumbers && request.metric}
          This workspace has used <strong>{request.used?.toLocaleString()}</strong> of
          <strong>{request.limit?.toLocaleString()}</strong>
          <strong data-bridge-upgrade-dialog-metric>{request.metric}</strong> on its current plan.
        {:else if request.metric}
          This workspace has reached its <strong data-bridge-upgrade-dialog-metric>{request.metric}</strong> limit.
        {:else}
          This workspace has reached a limit of its plan.
        {/if}
        {canUpgrade ? 'Upgrade the plan to keep going.' : 'Ask the workspace owner to upgrade the plan.'}
      </p>
    {/if}
    <div class="bridge-team-dialog-actions">
      {#if canUpgrade}
        <button type="button" class="bridge-btn bridge-btn-secondary" onclick={() => onclose()}>Not now</button>
        <a class="bridge-btn bridge-btn-primary" {href} data-bridge-upgrade-dialog-cta onclick={() => onclose()}>Upgrade plan</a>
      {:else}
        <button type="button" class="bridge-btn bridge-btn-primary" onclick={() => onclose()}>OK</button>
      {/if}
    </div>
  </div>
</dialog>
