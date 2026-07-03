<!--
  Billing 2.0 / Phase C / US-11 (TBP-263) — live quota counter banner.

  Drop-in component that renders a live "approaching cap" / "over cap" notice
  for a single metric. Reads `useBridge().quota(metric)` so initial hydration
  + live `quota.updated` pushes flow into the UI without any consumer wiring.

  Renders NOTHING while:
    - the metric has no quota configured on the plan (server returns null), OR
    - usage is below 80% of the limit (warningLevel === null).

  Three visible states:
    - approaching  (80-94% used)        → severity 'warn'
    - critical     (95-99% used)        → severity 'critical'
    - over-cap     (used > limit)       → severity 'critical', different copy

  Two role variants (admin / member): admins get an Upgrade CTA; members get
  an informational variant suggesting they contact their workspace owner.

  Reuses the BridgeBillingNotice chassis (rail variant, severity tokens,
  aria-live patterns).
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    useBridge,
    type QuotaSnapshot,
  } from '@nebulr-group/bridge-auth-core';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';
  import { getConfig } from '../../stores/config.store.js';

  type Chassis = 'rail';
  type Severity = 'warn' | 'critical';

  interface Props {
    /** Metric key to watch (e.g. 'ai_completions', 'bridge.active_users'). */
    metric: string;
    /**
     * Visual chassis variant. Only 'rail' is implemented in US-11; bar / card
     * variants land alongside the full design pack rollout.
     */
    chassis?: Chassis;
    /** Optional class applied to the root element. */
    class?: string;
    /** Override the default Upgrade CTA click handler. */
    onActionClick?: (snap: QuotaSnapshot) => void;
    /** CTA destination for this instance. Overrides `billing.manageRoute`
     *  config; `onActionClick` takes precedence over both. */
    actionHref?: string;
    /**
     * Optional display label override. Defaults to the snapshot's `.label`
     * (raw metric key for US-11; the framework wrapper will eventually
     * supply a humanized label).
     */
    label?: string;
  }

  let {
    metric,
    chassis = 'rail',
    class: className = '',
    onActionClick,
    actionHref,
    label,
  }: Props = $props();

  // Trigger lazy hydration immediately so subscribers see the snapshot the
  // moment the server responds (the store dedupes repeat calls).
  let snapshot = $state<QuotaSnapshot | undefined>(useBridge().quota(metric));
  let unsubscribe: (() => void) | undefined;

  // Role variant mirrors BridgeBillingNotice: any authenticated user is
  // treated as a billing admin for US-11 until the role/privilege API is
  // finalized. Member variant lands when the role probe is wired through.
  let isBillingAdmin = $state(false);

  onMount(() => {
    unsubscribe = useBridge().quotas.subscribe((m, snap) => {
      if (m !== metric) return;
      snapshot = snap;
    });
    // Re-trigger hydration in case the prop changed since `$state` init.
    snapshot = useBridge().quota(metric);

    try {
      const auth = getBridgeAuth();
      const ctx = auth.getApiContext();
      if (ctx.accessToken) {
        isBillingAdmin = true;
      }
    } catch {
      // No BridgeAuth instance — render the member variant.
    }
  });

  onDestroy(() => unsubscribe?.());

  // Re-hydrate when the metric prop changes mid-mount.
  $effect(() => {
    snapshot = useBridge().quota(metric);
  });

  const warningLevel = $derived(snapshot?.warningLevel ?? null);
  // TBP-275 — `metered` quotas bill overage instead of blocking. Prefer the
  // server-authoritative `overcap` flag (handles limit === 0 pure-per-unit)
  // over a UI-derived `used > limit`.
  const isMetered = $derived(snapshot?.policy === 'metered');
  const overCap = $derived(
    snapshot
      ? (snapshot.overcap ?? snapshot.used > snapshot.limit)
      : false,
  );
  // Hard caps show only at the warning thresholds. Metered quotas also show
  // once billing has engaged (overCap), even with no warningLevel — that's the
  // live "you're now being billed for overage" state.
  const visible = $derived(
    snapshot !== undefined && (warningLevel !== null || (isMetered && overCap)),
  );
  // Metered never blocks, so it never renders as 'critical' — it's informational.
  const severity = $derived<Severity>(
    isMetered
      ? 'warn'
      : warningLevel === 'critical' || overCap
        ? 'critical'
        : 'warn',
  );
  const displayLabel = $derived(label ?? snapshot?.label ?? metric);
  const percent = $derived(
    snapshot && snapshot.limit > 0
      ? Math.min(100, Math.round((snapshot.used / snapshot.limit) * 100))
      : 0,
  );
  // Meter bar is meaningless for pure per-unit metered (limit 0) — hide it there.
  const showMeter = $derived(!!snapshot && snapshot.limit > 0);

  /** Format an estimated cost like "$1.00" / "1.00 SEK". */
  function formatCost(amount: number | undefined, currency: string | undefined): string {
    if (amount === undefined) return '';
    const cur = (currency ?? '').toUpperCase();
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: cur || 'USD',
      }).format(amount);
    } catch {
      // Unknown currency code → fall back to "<amount> <CUR>".
      return `${amount.toFixed(2)}${cur ? ` ${cur}` : ''}`;
    }
  }

  function getCopy(
    snap: QuotaSnapshot | undefined,
    admin: boolean,
  ): { title: string; body: string; cta?: string } {
    if (!snap) return { title: '', body: '' };

    // TBP-275 — metered: live usage + projected cost, never a blocking message.
    if (snap.policy === 'metered') {
      const overUnits = snap.limit > 0 ? Math.max(0, snap.used - snap.limit) : snap.used;
      const cost = formatCost(snap.overageEstimate, snap.currency);
      const costSuffix = cost ? ` · ~${cost} estimated this period` : '';
      if (snap.limit > 0) {
        // included allotment + overage
        if (overUnits > 0) {
          return {
            title: `${displayLabel} overage`,
            body: `${overUnits.toLocaleString()} over your ${snap.limit.toLocaleString()} included${costSuffix}.`,
          };
        }
        // approaching the included allotment (warningLevel drove visibility)
        const unit = formatCost(snap.unitAmount, snap.currency);
        return {
          title: `${displayLabel} approaching included limit`,
          body: `You've used ${snap.used.toLocaleString()} of ${snap.limit.toLocaleString()} included${unit ? ` — extra usage is billed at ${unit}/unit` : ''}.`,
        };
      }
      // pure per-unit (limit 0) — billed from unit 1
      return {
        title: `${displayLabel} usage`,
        body: `${snap.used.toLocaleString()} ${displayLabel}${costSuffix}.`,
      };
    }

    const over = snap.overcap ?? snap.used > snap.limit;
    const remaining = Math.max(0, snap.remaining);
    if (over) {
      return admin
        ? {
            title: `${displayLabel} over cap`,
            body: `You've used ${snap.used.toLocaleString()} of ${snap.limit.toLocaleString()}. Upgrade your plan to add headroom.`,
            cta: 'Upgrade',
          }
        : {
            title: `${displayLabel} over cap`,
            body: `Your workspace is over its ${displayLabel} cap. Contact your workspace owner.`,
          };
    }
    if (warningLevel === 'critical') {
      return admin
        ? {
            title: `${displayLabel} near cap`,
            body: `You've used ${snap.used.toLocaleString()} of ${snap.limit.toLocaleString()} (${remaining.toLocaleString()} left). Upgrade to avoid hitting the cap.`,
            cta: 'Upgrade',
          }
        : {
            title: `${displayLabel} near cap`,
            body: `Your workspace is approaching its ${displayLabel} cap. Contact your workspace owner.`,
          };
    }
    // approaching
    return admin
      ? {
          title: `${displayLabel} approaching cap`,
          body: `You've used ${snap.used.toLocaleString()} of ${snap.limit.toLocaleString()} (${remaining.toLocaleString()} left).`,
          cta: 'Upgrade',
        }
      : {
          title: `${displayLabel} approaching cap`,
          body: `Your workspace is approaching its ${displayLabel} cap.`,
        };
  }

  const copy = $derived(getCopy(snapshot, isBillingAdmin));

  function handleAction() {
    if (!snapshot) return;
    if (onActionClick) {
      onActionClick(snapshot);
      return;
    }
    // Destination priority: `actionHref` prop → `billing.manageRoute` config
    // → '/billing'.
    if (typeof window !== 'undefined') {
      let manageRoute: string | undefined;
      try {
        manageRoute = getConfig().billing?.manageRoute;
      } catch {
        // Config not initialized — fall through to the default.
      }
      window.location.href = actionHref ?? manageRoute ?? '/billing';
    }
  }
</script>

{#if visible && snapshot}
  <div
    class={`bridge-quota-banner bqb-chassis-${chassis} bqb-severity-${severity} ${className}`}
    role={severity === 'critical' ? 'alert' : 'status'}
    aria-live={severity === 'critical' ? 'assertive' : 'polite'}
    aria-label={`${displayLabel} quota ${percent}% used`}
  >
    <div class="bqb-content">
      <strong class="bqb-title">{copy.title}</strong>
      <span class="bqb-body">{copy.body}</span>
      {#if showMeter}
        <div class="bqb-meter" aria-hidden="true">
          <div class="bqb-meter-fill" style={`width: ${Math.min(100, percent)}%`}></div>
        </div>
      {/if}
    </div>
    {#if copy.cta && isBillingAdmin}
      <button type="button" class="bqb-cta" onclick={handleAction}>{copy.cta}</button>
    {/if}
  </div>
{/if}

<style>
  .bridge-quota-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    font: inherit;
    transition: opacity 280ms ease, transform 320ms ease;
  }

  .bqb-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1 1 auto;
  }

  .bqb-title {
    font-weight: 600;
  }

  .bqb-body {
    font-size: 0.875rem;
    opacity: 0.85;
  }

  .bqb-meter {
    margin-top: 0.25rem;
    width: 100%;
    height: 0.375rem;
    background: rgba(0, 0, 0, 0.08);
    border-radius: 999px;
    overflow: hidden;
  }

  .bqb-meter-fill {
    height: 100%;
    background: currentColor;
    border-radius: 999px;
    transition: width 320ms ease;
  }

  .bqb-cta {
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

  .bqb-cta:hover {
    background: currentColor;
    color: white;
  }

  /* Chassis — rail only for US-11. */
  .bqb-chassis-rail {
    border-left: 4px solid currentColor;
    border-radius: 0 0.5rem 0.5rem 0;
  }

  /* Severity tokens — mirror BridgeBillingNotice for visual consistency. */
  .bqb-severity-warn {
    background: #fef3c7;
    color: #92400e;
  }

  .bqb-severity-critical {
    background: #fee2e2;
    color: #991b1b;
  }

  @media (prefers-reduced-motion: reduce) {
    .bridge-quota-banner,
    .bqb-meter-fill {
      transition: none;
    }
  }
</style>
