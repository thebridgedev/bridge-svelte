<!--
  <QuotaGate metric="tickets">: the action inside is disabled once the workspace
  is at its plan's hard limit, and an upgrade prompt shows beside it.

    <QuotaGate metric="tickets">
      <button onclick={createTicket}>New ticket</button>
      {#snippet atLimit(quota)}
        {quota.used} of {quota.limit} tickets used. <a href="/subscription">Upgrade</a>
      {/snippet}
    </QuotaGate>

  Disabling is a `<fieldset disabled>` around the children, so every button,
  input, select and textarea inside is disabled natively and announced as such,
  with no props to thread through your markup. Links are not form controls: put
  a link's action behind a button.

  Never disables on "don't know yet": while the quota is loading, the plan sets
  no limit on the metric, or the limit is metered (it bills the overage instead
  of blocking), the children are enabled. Only a known hard limit with nothing
  left disables them.

  Decoration only. Your server refuses the write; this saves the person a click
  that would be refused.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { peekConfig } from '../../core/client.js';
  import { useQuota, type QuotaState } from '../../core/quota.js';

  interface Props {
    /** The metric's key, such as `tickets`. */
    metric: string;
    /** The action or actions to disable at the limit. */
    children: Snippet;
    /** What to show at the limit instead of the default line. Receives the live quota. */
    atLimit?: Snippet<[QuotaState]>;
    /** Class on the wrapper. */
    class?: string;
  }

  let { metric, children, atLimit, class: className = '' }: Props = $props();

  const quota = useQuota(() => metric);
  const base = peekConfig()?.billingBase ?? '/subscription';

  // 'loading' | 'unlimited' | 'metered' | 'available' | 'at-limit'
  const gateState = $derived.by(() => {
    if (quota.loading) return 'loading';
    if (quota.unlimited) return 'unlimited';
    if (quota.snapshot?.policy === 'metered') return 'metered';
    const atCap = (quota.remaining !== null && quota.remaining <= 0) || (quota.used !== null && quota.limit !== null && quota.used >= quota.limit);
    return atCap ? 'at-limit' : 'available';
  });
  const blocked = $derived(gateState === 'at-limit');
</script>

<div class={['bridge-quota-gate', className]} data-bridge-quota-gate data-metric={metric} data-state={gateState}>
  <fieldset disabled={blocked} class="bridge-quota-gate-controls" style="display: contents">
    {@render children()}
  </fieldset>
  {#if blocked}
    <div class="bridge-quota-gate-limit" data-bridge-quota-gate-limit role="status">
      {#if atLimit}
        {@render atLimit(quota)}
      {:else}
        You've used all {quota.limit?.toLocaleString()} {metric} on your plan.
        <a href={base || '/'}>Upgrade</a>
      {/if}
    </div>
  {/if}
</div>
