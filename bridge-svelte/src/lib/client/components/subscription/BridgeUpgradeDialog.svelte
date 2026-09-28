<!--
  TBP-703 — the upgrade dialog. <BridgeBootstrap /> mounts it; the app writes
  nothing. When the app's backend refuses a request because a plan limit is
  reached (402, code QUOTA_EXCEEDED — bridge-nestjs's @RequireQuota), it opens,
  names the metric and the numbers, and links to the refusal's `fix` path or
  `billing.manageRoute` (default /subscription). A member who cannot manage
  billing (the <BridgeQuotaBanner> rule, billing-role.ts) is told to contact the
  workspace owner instead, with no Upgrade link.

  `billing.upgradeDialog: false` turns it off; a component there replaces it
  and receives the same props.

  Decoration only: the backend already refused the write. This explains why.
-->
<script lang="ts">
  import type { BridgeUpgradeDialogProps } from '../../../shared/types/config.js';
  import { quotaMemberBody } from '../../billing-role.js';
  import { plansIncludingFeature } from '../../upgrade-dialog.js';

  let { refusal, upgradeHref, canUpgrade, onclose, feature = null, plans = null }: BridgeUpgradeDialogProps = $props();

  let dialogEl: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (!dialogEl) return;
    if (refusal && !dialogEl.open) dialogEl.showModal();
    else if (!refusal && dialogEl.open) dialogEl.close();
  });

  const hasNumbers = $derived(refusal?.used != null && refusal?.limit != null);
  // TBP-755 — the plans that include the missing feature, from the plan list.
  const includedIn = $derived(plansIncludingFeature(plans, feature));
</script>

<dialog
  bind:this={dialogEl}
  class="bridge-team-dialog bridge-upgrade-dialog"
  data-bridge-upgrade-dialog
  data-metric={refusal?.metric}
  aria-labelledby="bridge-upgrade-dialog-title"
  onclose={() => {
    if (refusal) onclose();
  }}
>
  {#if refusal}
    <div class="bridge-team-dialog-content">
      <h3 id="bridge-upgrade-dialog-title" class="bridge-team-dialog-title">You've reached your plan's limit</h3>
      <p class="bridge-team-dialog-message" data-bridge-upgrade-dialog-message data-variant={canUpgrade ? 'admin' : 'member'}>
        {#if !canUpgrade}
          {quotaMemberBody(refusal.metric, 'over')}
        {:else if hasNumbers}
          This workspace has used <strong>{refusal.used?.toLocaleString()}</strong> of
          <strong>{refusal.limit?.toLocaleString()}</strong>
          <strong data-bridge-upgrade-dialog-metric>{refusal.metric}</strong> on its current plan.
        {:else}
          This workspace has reached its <strong data-bridge-upgrade-dialog-metric>{refusal.metric}</strong> limit.
        {/if}
        {#if canUpgrade}Upgrade the plan to keep going.{/if}
      </p>
      {#if includedIn.length > 0}
        <p class="bridge-team-dialog-message" data-bridge-upgrade-dialog-included-in>
          Included in: {includedIn.join(', ')}
        </p>
      {/if}
      <div class="bridge-team-dialog-actions">
        {#if canUpgrade}
          <button type="button" class="bridge-btn bridge-btn-secondary" onclick={() => onclose()}>Not now</button>
          <a class="bridge-btn bridge-btn-primary" href={upgradeHref} data-bridge-upgrade-dialog-cta onclick={() => onclose()}>
            Upgrade plan
          </a>
        {:else}
          <button type="button" class="bridge-btn bridge-btn-primary" onclick={() => onclose()}>OK</button>
        {/if}
      </div>
    </div>
  {/if}
</dialog>
