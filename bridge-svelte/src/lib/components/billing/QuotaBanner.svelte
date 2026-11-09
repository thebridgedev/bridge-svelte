<!--
  A banner for one metric nearing or at its plan limit:

    <QuotaBanner metric="projects" label="Projects" />

  Renders nothing below 80% of the limit, or for a metric with no limit. It
  shows numbers only and blocks nothing: whether something is allowed is a
  flag. A person with the `billingManage` flag gets an Upgrade link; anyone
  else is told to contact the workspace owner.
-->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { peekConfig } from '../../core/client.js';
  import { canManageBilling } from '../../core/flags.js';
  import { usage } from '../../core/stores.js';
  import { quotaFor, type Quota } from './quota.js';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** The metric to watch, such as `projects`. */
    metric: string;
    /** The metric's name in the copy. @default the metric key */
    label?: string;
    /** Where Upgrade goes. @default the subscription page */
    actionHref?: string;
    /** Replaces Upgrade's navigation. */
    onActionClick?: (quota: Quota) => void;
  }

  let { metric, label, actionHref, onActionClick, class: className, style, ...rest }: Props = $props();

  const base = peekConfig()?.billingBase ?? '/subscription';
  const canManage = canManageBilling();
  const OWNER = 'Contact your workspace owner.';

  const quota = $derived(quotaFor($usage.value, metric));
  const visible = $derived(quota !== null && quota.state !== 'ok');
  const name = $derived(label ?? metric);
  const percent = $derived(quota ? Math.min(100, Math.round(quota.ratio * 100)) : 0);
  const href = $derived(actionHref ?? (base || '/'));
  const copy = $derived(quota ? copyFor(quota, $canManage, name) : null);

  function copyFor(q: Quota, admin: boolean, what: string): { title: string; body: string } {
    const used = q.used.toLocaleString();
    const limit = q.limit.toLocaleString();
    if (q.used > q.limit) {
      return admin
        ? { title: `${what} over cap`, body: `You've used ${used} of ${limit}. Upgrade your plan to add headroom.` }
        : { title: `${what} over cap`, body: `Your workspace is over its ${what} cap. ${OWNER}` };
    }
    if (q.state === 'over') {
      return admin
        ? { title: `${what} limit reached`, body: `You've used all ${limit} on your plan. Upgrade your plan to add more.` }
        : { title: `${what} limit reached`, body: `Your workspace has reached its ${what} limit. ${OWNER}` };
    }
    const left = Math.max(0, q.limit - q.used).toLocaleString();
    return admin
      ? { title: `${what} approaching cap`, body: `You've used ${used} of ${limit} (${left} left).` }
      : { title: `${what} approaching cap`, body: `Your workspace is approaching its ${what} cap.` };
  }

  function handleAction(event: MouseEvent) {
    if (!onActionClick || !quota) return;
    event.preventDefault();
    onActionClick(quota);
  }
</script>

{#if visible && quota && copy}
  <div
    class={['bridge-quota-banner', className]}
    {style}
    data-bridge-quota-banner
    data-metric={metric}
    data-state={quota.state}
    role={quota.state === 'over' ? 'alert' : 'status'}
    aria-live={quota.state === 'over' ? 'assertive' : 'polite'}
    aria-label={`${name} quota ${percent}% used`}
    {...rest}
  >
    <div class="bqb-content">
      <strong class="bqb-title">{copy.title}</strong>
      <span class="bqb-body">{copy.body}</span>
      {#if quota.limit > 0}
        <div class="bqb-meter" aria-hidden="true">
          <div class="bqb-meter-fill" style:width="{percent}%"></div>
        </div>
      {/if}
    </div>
    {#if $canManage}
      <a class="bqb-cta" {href} data-bridge-quota-banner-cta onclick={handleAction}>Upgrade</a>
    {/if}
  </div>
{/if}
