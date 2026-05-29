<!--
  Billing 2.0 / Phase B / US-5 → US-9 — unified billing-notice component.

  Drop-in component that renders the workspace's current billing notice based
  on `useBridge().subscription`. Designed for multi-state from the start:
  US-5 implements the `past_due` paths; US-6 adds cancellation; US-8 adds
  trial states; US-9 adds dunning + locked. New states slot in via the
  notice-state -> content map without restructuring.

  Audience: reads the existing auth context to render admin (CTA) vs member
  (no CTA) variants. Per locked decision, role lives where it lives today —
  NOT on useBridge().subscription.

  Not dismissible — stays until status flips back to active.
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    deriveNoticeState,
    deriveSeverity,
    useBridge,
    type BillingNoticeState,
    type BillingSeverity,
    type BillingSubscriptionSnapshot,
  } from '@nebulr-group/bridge-auth-core';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';

  type Chassis = 'bar' | 'rail' | 'card';

  interface Props {
    /** Visual chassis variant. Per `deliverables.html §01`. */
    chassis?: Chassis;
    /**
     * Gate behavior. `soft` (default) always renders the inline banner. `hard`
     * renders a full-screen blocking lockscreen when the workspace is locked
     * (gate engaged); non-locked states still render as the inline banner.
     */
    mode?: 'soft' | 'hard';
    /** Optional class applied to the root element. */
    class?: string;
    /** Override the default CTA click handler (links to billing surface). */
    onActionClick?: (state: BillingNoticeState) => void;
  }

  let {
    chassis = 'rail',
    mode = 'soft',
    class: className = '',
    onActionClick,
  }: Props = $props();

  let snapshot = $state<BillingSubscriptionSnapshot>(useBridge().subscription.snapshot());
  let unsubscribe: (() => void) | undefined;

  // Admin/member variant — read from existing auth context. The exact field
  // name varies by SDK; we look up `billing` privilege on the current user.
  // Defaults to non-admin if unavailable.
  let isBillingAdmin = $state(false);

  onMount(() => {
    unsubscribe = useBridge().subscription.subscribe((snap) => {
      snapshot = snap;
    });

    const auth = getBridgeAuth();
    const ctx = auth.getApiContext();
    if (ctx.accessToken) {
      // Best-effort role read. Existing auth-core role probing varies by app;
      // defensive cast so the component never crashes on missing fields.
      const tokenManager = (auth as unknown as { tokenManager?: { getTokens?: () => { accessToken?: string } } }).tokenManager;
      void tokenManager; // intentionally unused — placeholder until role API is finalized
      // For US-5 default: assume admin if a JWT is present. Subsequent
      // stories will read the exact privilege claim. Keeping permissive so
      // the CTA shows by default; member variant lands when the role check
      // is wired through.
      isBillingAdmin = true;
    }

    if (!ctx.accessToken) {
      useBridge().subscription.setError('Not authenticated');
      return;
    }
    if (!snapshot.state) {
      useBridge().subscription.mount({
        apiBaseUrl: ctx.apiBaseUrl,
        accessToken: ctx.accessToken,
        appId: ctx.appId,
      });
    }
  });

  onDestroy(() => unsubscribe?.());

  const noticeState = $derived<BillingNoticeState>(deriveNoticeState(snapshot.state));
  const severity = $derived<BillingSeverity>(deriveSeverity(noticeState));
  const visible = $derived(snapshot.state !== null && noticeState !== 'active');
  const asLockscreen = $derived(mode === 'hard' && severity === 'locked');

  // Copy map per `deliverables.html §06`. US-5 ships past_due copy; later
  // stories fill in trial/cancel/dunning variants. Member variant suppresses
  // the CTA and softens the call-to-action.
  function getCopy(state: BillingNoticeState, admin: boolean): { title: string; body: string; cta?: string } {
    const cardLast4 = snapshot.state?.cardLast4;
    const endsAt = snapshot.state?.endsAt;
    const daysLeft = snapshot.state?.daysLeft;
    const nextRetryAt = snapshot.state?.nextRetryAt;

    switch (state) {
      case 'past_due':
        return admin
          ? {
              title: 'Payment failed',
              body: cardLast4
                ? `We couldn't charge your card ending in ${cardLast4}. Update your payment method to keep using ${snapshot.state?.plan.name ?? 'your plan'}.`
                : `We couldn't charge your card. Update your payment method to keep using ${snapshot.state?.plan.name ?? 'your plan'}.`,
              cta: 'Update card',
            }
          : {
              title: "Your workspace's payment failed",
              body: 'Please contact your workspace owner to update the payment method.',
            };
      case 'past_due_trial':
        return admin
          ? {
              title: 'Trial ended',
              body: 'Add a payment method to keep using your workspace.',
              cta: 'Add card',
            }
          : {
              title: "Your workspace's trial has ended",
              body: 'Please contact your workspace owner to add a payment method.',
            };
      case 'trial_active':
        return admin
          ? {
              title: 'Trial active',
              body: daysLeft !== undefined ? `${daysLeft} days left in your trial.` : 'Trial in progress.',
            }
          : {
              title: 'Trial active',
              body: daysLeft !== undefined ? `${daysLeft} days left.` : 'Trial in progress.',
            };
      case 'trial_ending_soon':
        return admin
          ? {
              title: 'Trial ending soon',
              body: daysLeft !== undefined ? `${daysLeft} days left. Add a payment method to keep your access.` : 'Add a payment method to keep your access.',
              cta: 'Add card',
            }
          : {
              title: 'Trial ending soon',
              body: daysLeft !== undefined ? `${daysLeft} days left.` : 'Contact your workspace owner.',
            };
      case 'cancel_at_period_end':
        return admin
          ? {
              title: 'Subscription ending',
              body: endsAt
                ? `Your subscription ends ${new Date(endsAt).toLocaleDateString()}. You'll keep full access until then.`
                : "Your subscription is ending. You'll keep access until the period ends.",
              cta: 'Reactivate',
            }
          : {
              title: 'Subscription ending',
              body: endsAt ? `Your workspace's subscription ends ${new Date(endsAt).toLocaleDateString()}.` : "Your workspace's subscription is ending.",
            };
      case 'canceled':
        return admin
          ? { title: 'Subscription canceled', body: 'Your subscription has ended. Choose a plan to continue.', cta: 'Choose plan' }
          : { title: 'Subscription canceled', body: 'Please contact your workspace owner.' };
      case 'dunning_active':
        return admin
          ? {
              title: 'Payment retry scheduled',
              body: nextRetryAt
                ? `We'll retry your payment on ${new Date(nextRetryAt).toLocaleDateString()}. Update your card to avoid interruption.`
                : "We'll retry your payment soon. Update your card to avoid interruption.",
              cta: 'Update card',
            }
          : { title: 'Payment retry scheduled', body: 'Please contact your workspace owner to update the payment method.' };
      case 'dunning_final_retry':
        return admin
          ? {
              title: 'Final payment retry',
              body: 'This is the last automatic retry. Update your card now to avoid losing access.',
              cta: 'Update card',
            }
          : { title: 'Final payment retry', body: 'Please contact your workspace owner immediately.' };
      case 'dunning_exhausted':
        return admin
          ? { title: 'Access locked', body: 'Payment retries have exhausted. Update your card to restore access.', cta: 'Update card' }
          : { title: 'Access locked', body: 'Please contact your workspace owner.' };
      default:
        return { title: '', body: '' };
    }
  }

  const copy = $derived(getCopy(noticeState, isBillingAdmin));

  function handleAction() {
    if (onActionClick) {
      onActionClick(noticeState);
      return;
    }
    // Default: open the existing billing surface. The exact destination
    // depends on app configuration — for now, navigate to /billing on the
    // current origin. Apps can override via `onActionClick`.
    if (typeof window !== 'undefined') {
      window.location.href = '/billing';
    }
  }
</script>

{#if visible}
  {#if asLockscreen}
    <div
      class={`bridge-billing-lockscreen ${className}`}
      role="alertdialog"
      aria-modal="true"
      aria-live="assertive"
    >
      <div class="bbl-panel">
        <strong class="bbl-title">{copy.title}</strong>
        <span class="bbl-body">{copy.body}</span>
        {#if copy.cta && isBillingAdmin}
          <button type="button" class="bbl-cta" onclick={handleAction}>{copy.cta}</button>
        {/if}
      </div>
    </div>
  {:else}
    <div
      class={`bridge-billing-notice bbn-chassis-${chassis} bbn-severity-${severity} ${className}`}
      role={severity === 'critical' || severity === 'locked' ? 'alert' : 'status'}
      aria-live={severity === 'critical' || severity === 'locked' ? 'assertive' : 'polite'}
    >
      <div class="bbn-content">
        <strong class="bbn-title">{copy.title}</strong>
        <span class="bbn-body">{copy.body}</span>
      </div>
      {#if copy.cta && isBillingAdmin}
        <button type="button" class="bbn-cta" onclick={handleAction}>{copy.cta}</button>
      {/if}
    </div>
  {/if}
{/if}

<style>
  .bridge-billing-notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    font: inherit;
    transition: opacity 280ms ease, transform 320ms ease;
  }

  .bbn-content {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    flex: 1 1 auto;
  }

  .bbn-title {
    font-weight: 600;
  }

  .bbn-body {
    font-size: 0.875rem;
    opacity: 0.85;
  }

  .bbn-cta {
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    border: 1px solid currentColor;
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: 500;
    cursor: pointer;
    flex: 0 0 auto;
  }

  .bbn-cta:hover {
    background: currentColor;
    color: white;
  }

  /* Chassis variants */
  .bbn-chassis-bar {
    border-radius: 0;
    width: 100%;
  }

  .bbn-chassis-rail {
    border-left: 4px solid currentColor;
    border-radius: 0 0.5rem 0.5rem 0;
  }

  .bbn-chassis-card {
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    border: 1px solid rgba(0, 0, 0, 0.08);
  }

  /* Severity tokens */
  .bbn-severity-info {
    background: #dbeafe;
    color: #1e40af;
  }

  .bbn-severity-warn {
    background: #fef3c7;
    color: #92400e;
  }

  .bbn-severity-critical {
    background: #fee2e2;
    color: #991b1b;
  }

  .bbn-severity-locked {
    background: #1f2937;
    color: #f9fafb;
  }

  @media (prefers-reduced-motion: reduce) {
    .bridge-billing-notice {
      transition: none;
    }
  }

  /* Hard-mode lockscreen — full-viewport blocking overlay */
  .bridge-billing-lockscreen {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(15, 23, 42, 0.72);
    backdrop-filter: blur(2px);
  }

  .bbl-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-width: 28rem;
    width: 100%;
    padding: 1.5rem;
    border-radius: 0.75rem;
    background: #1f2937;
    color: #f9fafb;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
    text-align: center;
  }

  .bbl-title {
    font-size: 1.125rem;
    font-weight: 600;
  }

  .bbl-body {
    font-size: 0.9375rem;
    opacity: 0.85;
  }

  .bbl-cta {
    align-self: center;
    margin-top: 0.5rem;
    padding: 0.625rem 1.25rem;
    border-radius: 0.5rem;
    border: 1px solid currentColor;
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }

  .bbl-cta:hover {
    background: #f9fafb;
    color: #1f2937;
  }
</style>
