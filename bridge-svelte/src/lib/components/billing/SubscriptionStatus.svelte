<!--
  The workspace's plan name and a status badge (trial, active, past due,
  ending, canceled), from the billing facts. It follows plan changes on its
  own: the facts are fetched again on every billing change.
-->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { errorMessage, translator } from '../../core/i18n.js';
  import { billing } from '../../core/stores.js';
  import { statusBadge } from './plan-format.js';

  type Props = HTMLAttributes<HTMLSpanElement>;

  let { class: className, style, ...rest }: Props = $props();

  const facts = $derived($billing.value);
  const view = $derived(facts ? (facts.plan ? 'plan' : 'empty') : $billing.error ? 'error' : 'loading');
  const badge = $derived(facts ? statusBadge(facts) : null);
</script>

<span
  class={['bridge-subscription-status', className]}
  {style}
  data-bridge-subscription-status
  data-state={view}
  data-status={facts?.status}
  {...rest}
>
  {#if view === 'loading'}
    <span class="bss-loading">Loading…</span>
  {:else if view === 'error'}
    <span class="bss-error" title={errorMessage($billing.error, translator(), 'error.generic')}>Subscription unavailable</span>
  {:else if facts?.plan}
    <span class="bss-plan">{facts.plan.name}</span>
    {#if badge}
      <span class="bss-badge" data-status={badge.status}>{badge.label}</span>
    {/if}
  {:else}
    <span class="bss-empty">No subscription</span>
  {/if}
</span>
