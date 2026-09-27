<!--
  TBP-703 — <QuotaGate metric="tickets">: the action inside is disabled once the
  workspace is at its plan's hard cap, and an upgrade prompt shows beside it.

    <QuotaGate metric="tickets">
      <button onclick={createTicket}>New ticket</button>
      {#snippet atLimit(quota)}
        {quota.used} of {quota.limit} tickets used. <a href="/subscription">Upgrade</a>
      {/snippet}
    </QuotaGate>

  Disabling is done by a <fieldset disabled> around the children, so every
  button, input, select and textarea inside is disabled natively and announced
  as such — no prop threading into your markup. (Links are not form controls;
  put a link's action behind a button.)

  Never disables on "don't know yet": while the quota is loading, the plan has
  no quota on the metric, or the quota is metered (it bills overage instead of
  blocking), the children are enabled. Only a known hard cap with nothing left
  disables them.

  Decoration only. The backend's @RequireQuota is what refuses the write; this
  just saves the user a click that would be refused.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { useQuota, type QuotaState } from '../../../core/use-quota.js';
  import { billingRoutes } from '../../billing-routes.js';

  interface Props {
    /** The quota metric key, e.g. `'tickets'`. */
    metric: string;
    /** The action(s) to disable at the cap. */
    children: Snippet;
    /**
     * What to show at the cap, instead of the default "limit reached — Upgrade"
     * line. Receives the live quota (`used`, `limit`, `remaining`, …).
     */
    atLimit?: Snippet<[QuotaState]>;
    /** Class on the wrapper. */
    class?: string;
  }

  let { metric, children, atLimit, class: className = '' }: Props = $props();

  const quota = useQuota(() => metric);

  // 'loading' | 'unlimited' | 'metered' | 'available' | 'at-limit'
  const gateState = $derived.by(() => {
    if (quota.loading) return 'loading';
    if (quota.unlimited) return 'unlimited';
    if (quota.snapshot?.policy === 'metered') return 'metered';
    const atCap =
      (quota.remaining !== null && quota.remaining <= 0) ||
      (quota.used !== null && quota.limit !== null && quota.used >= quota.limit);
    return atCap ? 'at-limit' : 'available';
  });
  const blocked = $derived(gateState === 'at-limit');
  const manageRoute = $derived(billingRoutes().manageRoute);
</script>

<div class="bridge-quota-gate {className}" data-bridge-quota-gate data-metric={metric} data-state={gateState}>
  <fieldset disabled={blocked} class="bridge-quota-gate-controls" style="display: contents">
    {@render children()}
  </fieldset>
  {#if blocked}
    <div class="bridge-quota-gate-limit" data-bridge-quota-gate-limit role="status">
      {#if atLimit}
        {@render atLimit(quota)}
      {:else}
        You've used all {quota.limit?.toLocaleString()} {metric} on your plan.
        <a href={manageRoute}>Upgrade</a>
      {/if}
    </div>
  {/if}
</div>
