<!--
  The one billing notice worth showing now, most urgent first: access locked,
  a payment due, no plan, a trial ending, the subscription ending, or a plan
  change waiting. Renders nothing when all is well. A person with the
  `billingManage` flag gets a link to the billing pages; anyone else is told
  to ask the workspace owner. Not dismissible: it goes when the facts change.

  A workspace locked for payment shows to every person, from the lock Bridge
  keeps (`billingGate`), and at once when your API refuses a write with the lock's
  402 through `bridgeFetch`. With `mode="hard"` the lock covers the page as a
  blocking screen; every other notice stays a banner.
-->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { billingNotice, type BillingNotice as Notice } from '@nebulr-group/bridge-auth-core';
  import { peekConfig } from '../../core/client.js';
  import { billingGate } from '../../core/billing-gate.js';
  import { canManageBilling } from '../../core/flags.js';
  import { billing, plans } from '../../core/stores.js';
  import { formatDate } from './plan-format.js';

  type Chassis = 'bar' | 'rail' | 'card';
  type Severity = 'info' | 'warn' | 'critical' | 'locked';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** The notice's shape: a full-width bar, a rail with a left edge, or a card. @default 'rail' */
    chassis?: Chassis;
    /** `hard` covers the page with a blocking screen while the workspace is locked for payment; other notices stay banners. @default 'soft' */
    mode?: 'soft' | 'hard';
    /** Where the action link goes. @default the plan page for no plan, else the subscription page */
    actionHref?: string;
    /** Replaces the action link's navigation. */
    onActionClick?: (notice: Notice) => void;
  }

  let { chassis = 'rail', mode = 'soft', actionHref, onActionClick, class: className, style, ...rest }: Props = $props();

  const config = peekConfig();
  const base = config?.billingBase ?? '/subscription';
  const canManage = canManageBilling();

  const SEVERITY: Record<Notice['kind'], Severity> = {
    blocked: 'locked',
    'payment-due': 'critical',
    'needs-plan': 'critical',
    'trial-ending': 'warn',
    ending: 'warn',
    waiting: 'info',
  };

  const OWNER = 'Please contact your workspace owner.';

  const BLOCKED: Notice = { kind: 'blocked' };
  // The lock is shown from the gate as well as the billing facts: the gate is read by every person, and a refusal shows it at once.
  const notice = $derived<Notice | null>($billingGate.locked ? BLOCKED : $billing.value ? billingNotice($billing.value) : null);
  const lockscreen = $derived(mode === 'hard' && notice?.kind === 'blocked');
  const severity = $derived(notice ? SEVERITY[notice.kind] : 'info');
  const urgent = $derived(severity === 'critical' || severity === 'locked');
  const href = $derived(actionHref ?? (notice?.kind === 'needs-plan' ? `${base}/plan` : base || '/'));
  const copy = $derived(notice ? copyFor(notice, $canManage) : null);

  function planName(key: string): string {
    return $plans.value?.find((p) => p.key === key)?.name ?? key;
  }

  function daysLeft(days: number): string {
    if (days <= 0) return 'The trial ends today.';
    return `${days} ${days === 1 ? 'day' : 'days'} left.`;
  }

  function copyFor(n: Notice, admin: boolean): { title: string; body: string; cta?: string } {
    const current = $billing.value?.plan?.name ?? 'your plan';
    switch (n.kind) {
      case 'blocked':
        return admin
          ? { title: 'Access locked', body: 'Update the payment method to restore access.', cta: 'Update card' }
          : { title: 'Access locked', body: OWNER };
      case 'payment-due':
        return admin
          ? { title: 'Payment failed', body: `We couldn't charge your card. Update your payment method to keep using ${current}.`, cta: 'Update card' }
          : { title: "Your workspace's payment failed", body: 'Please contact your workspace owner to update the payment method.' };
      case 'needs-plan':
        return admin
          ? { title: 'No active plan', body: 'Choose a plan to continue.', cta: 'Choose plan' }
          : { title: 'No active plan', body: OWNER };
      case 'trial-ending':
        return admin
          ? { title: 'Trial ending soon', body: `${daysLeft(n.daysLeft)} Add a payment method to keep your access.`, cta: 'Add card' }
          : { title: 'Trial ending soon', body: daysLeft(n.daysLeft) };
      case 'ending': {
        const ends = formatDate(n.periodEnd);
        return admin
          ? {
              title: 'Subscription ending',
              body: ends
                ? `Your subscription ends ${ends}. You'll keep full access until then.`
                : "Your subscription is ending. You'll keep access until the period ends.",
              cta: 'Manage billing',
            }
          : { title: 'Subscription ending', body: ends ? `Your workspace's subscription ends ${ends}.` : "Your workspace's subscription is ending." };
      }
      case 'waiting':
        return n.waitsFor === 'payment'
          ? { title: 'Waiting for payment', body: `The move to ${planName(n.plan)} starts once the payment goes through.` }
          : { title: 'Plan change scheduled', body: `The workspace moves to ${planName(n.plan)} at the end of this billing period.` };
    }
  }

  function handleAction(event: MouseEvent) {
    if (!onActionClick || !notice) return;
    event.preventDefault();
    onActionClick(notice);
  }
</script>

{#if notice && copy && lockscreen}
  <div class={['bridge-billing-lockscreen', className]} {style} data-bridge-billing-lockscreen role="alertdialog" aria-modal="true" aria-live="assertive" aria-labelledby="bridge-lock-title">
    <div class="bbl-panel">
      <strong id="bridge-lock-title" class="bbl-title">{copy.title}</strong>
      <span class="bbl-body">{copy.body}</span>
      {#if copy.cta && $canManage}
        <a class="bbl-cta" {href} data-bridge-billing-notice-cta onclick={handleAction}>{copy.cta}</a>
      {/if}
    </div>
  </div>
{:else if notice && copy}
  <div
    class={['bridge-billing-notice', className]}
    {style}
    data-bridge-billing-notice
    data-kind={notice.kind}
    data-severity={severity}
    data-chassis={chassis}
    role={urgent ? 'alert' : 'status'}
    aria-live={urgent ? 'assertive' : 'polite'}
    {...rest}
  >
    <div class="bbn-content">
      <strong class="bbn-title">{copy.title}</strong>
      <span class="bbn-body">{copy.body}</span>
    </div>
    {#if copy.cta && $canManage}
      <a class="bbn-cta" {href} data-bridge-billing-notice-cta onclick={handleAction}>{copy.cta}</a>
    {/if}
  </div>
{/if}
