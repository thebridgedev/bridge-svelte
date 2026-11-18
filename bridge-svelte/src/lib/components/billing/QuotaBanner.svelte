<!--
  A banner for one metric nearing or at its plan limit:

    <QuotaBanner metric="projects" label="Projects" />

  Renders nothing while the metric has no limit or is below 80% of it. It moves
  by itself: Bridge's quota notices read the numbers again. It shows numbers
  only and blocks nothing: whether something is allowed is a flag. A person with
  the `billingManage` flag gets an Upgrade link; anyone else is told to contact
  the workspace owner. A metered limit shows the overage instead of a warning.
-->
<script lang="ts">
  import type { QuotaSnapshot } from '@nebulr-group/bridge-auth-core';
  import type { HTMLAttributes } from 'svelte/elements';
  import { peekConfig } from '../../core/client.js';
  import { canManageBilling } from '../../core/flags.js';
  import { useQuota } from '../../core/quota.js';
  import { quotaBannerCopy, quotaBannerState } from './quota-copy.js';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** The metric to watch, such as `projects`. */
    metric: string;
    /** The metric's name in the copy. @default the metric key */
    label?: string;
    /** Where Upgrade goes. @default the subscription page */
    actionHref?: string;
    /** Replaces Upgrade's navigation. */
    onActionClick?: (snapshot: QuotaSnapshot) => void;
  }

  let { metric, label, actionHref, onActionClick, class: className, style, ...rest }: Props = $props();

  const base = peekConfig()?.billingBase ?? '/subscription';
  const canManage = canManageBilling();
  const quota = useQuota(() => metric);

  const snapshot = $derived(quota.snapshot);
  const state = $derived(quotaBannerState(snapshot));
  const critical = $derived(state === 'critical' || state === 'reached' || state === 'over');
  const name = $derived(label ?? snapshot?.label ?? metric);
  const percent = $derived(snapshot && snapshot.limit > 0 ? Math.min(100, Math.round((snapshot.used / snapshot.limit) * 100)) : 0);
  const href = $derived(actionHref ?? (base || '/'));
  const copy = $derived(quotaBannerCopy(snapshot, $canManage, name));

  function handleAction(event: MouseEvent) {
    if (!onActionClick || !snapshot) return;
    event.preventDefault();
    onActionClick(snapshot);
  }
</script>

{#if state !== 'hidden' && snapshot}
  <div
    class={['bridge-quota-banner', className]}
    {style}
    data-bridge-quota-banner
    data-metric={metric}
    data-state={state}
    data-severity={critical ? 'critical' : 'warn'}
    role={critical ? 'alert' : 'status'}
    aria-live={critical ? 'assertive' : 'polite'}
    aria-label={`${name} quota ${percent}% used`}
    {...rest}
  >
    <div class="bqb-content">
      <strong class="bqb-title">{copy.title}</strong>
      <span class="bqb-body">{copy.body}</span>
      {#if snapshot.limit > 0}
        <div class="bqb-meter" aria-hidden="true">
          <div class="bqb-meter-fill" style:width="{percent}%"></div>
        </div>
      {/if}
    </div>
    {#if copy.cta && $canManage}
      <a class="bqb-cta" {href} data-bridge-quota-banner-cta onclick={handleAction}>{copy.cta}</a>
    {/if}
  </div>
{/if}
