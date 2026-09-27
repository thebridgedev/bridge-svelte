<!--
  TBP-703 — the upgrade dialog. <BridgeBootstrap /> mounts it; the app writes
  nothing. When the app's backend refuses a request because a plan limit is
  reached (402, code QUOTA_EXCEEDED — bridge-nestjs's @RequireQuota), it opens,
  names the metric and the numbers, and links to the refusal's `fix` path or
  `billing.manageRoute` (default /subscription).

  `billing.upgradeDialog: false` turns it off; a component there replaces it
  and receives the same props.

  Decoration only: the backend already refused the write. This explains why.
-->
<script lang="ts">
  import type { BridgeUpgradeDialogProps } from '../../../shared/types/config.js';

  let { refusal, upgradeHref, onclose }: BridgeUpgradeDialogProps = $props();

  let dialogEl: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (!dialogEl) return;
    if (refusal && !dialogEl.open) dialogEl.showModal();
    else if (!refusal && dialogEl.open) dialogEl.close();
  });

  const hasNumbers = $derived(refusal?.used != null && refusal?.limit != null);
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
      <p class="bridge-team-dialog-message" data-bridge-upgrade-dialog-message>
        {#if hasNumbers}
          This workspace has used <strong>{refusal.used?.toLocaleString()}</strong> of
          <strong>{refusal.limit?.toLocaleString()}</strong>
          <strong data-bridge-upgrade-dialog-metric>{refusal.metric}</strong> on its current plan.
        {:else}
          This workspace has reached its <strong data-bridge-upgrade-dialog-metric>{refusal.metric}</strong> limit.
        {/if}
        Upgrade the plan to keep going.
      </p>
      <div class="bridge-team-dialog-actions">
        <button type="button" class="bridge-btn bridge-btn-secondary" onclick={() => onclose()}>Not now</button>
        <a class="bridge-btn bridge-btn-primary" href={upgradeHref} data-bridge-upgrade-dialog-cta onclick={() => onclose()}>
          Upgrade plan
        </a>
      </div>
    </div>
  {/if}
</dialog>
