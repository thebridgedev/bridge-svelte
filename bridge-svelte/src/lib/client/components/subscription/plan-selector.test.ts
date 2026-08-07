// PlanSelector — annual-default interval (TBP-34) + plan-change confirmation (TBP-33).
//
// HARNESS NOTE: bridge-svelte's vitest config (vitest.config.ts) runs in a
// `node` environment with no Svelte compiler plugin and no DOM (jsdom /
// @testing-library/svelte are NOT installed anywhere in the workspace), so the
// PlanSelector.svelte component cannot be mounted here. Following the
// established pattern in billing-notice-gate.test.ts, this file exercises an
// EXACT replica of the component's script-block decisions, with the external
// singletons (getBridgeAuth / loadSubscription / getConfig / window.location)
// injected as mocks instead of module-mocking `bridge-instance.js`.
//
// The replicated logic mirrors PlanSelector.svelte:
//   - availableIntervals   ($derived.by, paid prices only, stable order)
//   - selectedInterval     (override → defaultInterval → first available)
//   - showIntervalTabs     (≥2 intervals)
//   - pricesForInterval    (matching interval + interval-agnostic free prices)
//   - handlePick           (free → selectFreePlan; paymentsEnabled+paid →
//                           confirm dialog, NO changePlan; else → checkout)
//   - confirmPlanChange    (changePlan behind explicit confirm; success notice;
//                           failure kept inside the dialog)
//
// If PlanSelector.svelte's script logic changes, update the replica here to
// match — a drift between the two is a test bug, not a component bug.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Plan, PriceOfferSdk } from '@nebulr-group/bridge-auth-core';

type BillingInterval = PriceOfferSdk['recurrenceInterval'];
// `hasCost` is delivered by the phase-2 backend plan payload (TBP-275); the
// installed auth-core d.ts may lag behind, so widen the type locally.
type PlanDef = Plan & { hasCost?: boolean };

// ── Replicas of the interval derivations (TBP-34) ────────────────────────────

const INTERVAL_LABELS: Record<BillingInterval, string> = {
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
  year: 'Yearly',
};

/** Mirror of the component's `availableIntervals` $derived.by. */
function availableIntervals(plans: PlanDef[] | null): BillingInterval[] {
  const order: BillingInterval[] = ['day', 'week', 'month', 'year'];
  return order.filter((i) =>
    (plans ?? []).some((plan) =>
      plan.prices.some((p) => p.amount > 0 && p.recurrenceInterval === i),
    ),
  );
}

/** Mirror of the component's `selectedInterval` $derived.by. */
function selectedInterval(
  plans: PlanDef[] | null,
  defaultInterval: BillingInterval,
  intervalOverride: BillingInterval | null = null,
): BillingInterval {
  const available = availableIntervals(plans);
  if (intervalOverride && available.includes(intervalOverride)) {
    return intervalOverride;
  }
  return available.includes(defaultInterval)
    ? defaultInterval
    : (available[0] ?? defaultInterval);
}

/** Mirror of the component's `showIntervalTabs` $derived. */
function showIntervalTabs(plans: PlanDef[] | null): boolean {
  return availableIntervals(plans).length >= 2;
}

/** Mirror of the component's `pricesForInterval(plan)`. */
function pricesForInterval(plan: PlanDef, selected: BillingInterval): PriceOfferSdk[] {
  return plan.prices.filter(
    (p) => p.amount === 0 || p.recurrenceInterval === selected,
  );
}

// ── Replica of the pick / confirm state machine (TBP-33) ─────────────────────

interface SubscriptionStatus {
  paymentsEnabled?: boolean;
  plan?: string | Plan;
}

interface HarnessOptions {
  plans?: PlanDef[] | null;
  status?: SubscriptionStatus | null;
  callbackUrl?: string;
  onSelect?: (detail: { plan: Plan; price: PriceOfferSdk }) => void;
  successRedirect?: string;
  cancelRedirect?: string;
}

function makeHarness(opts: HarnessOptions = {}) {
  const {
    plans = null,
    status = null,
    callbackUrl,
    onSelect,
    successRedirect = '/subscription',
    cancelRedirect = '/subscription',
  } = opts;

  // Injected singletons (component gets these from bridge-instance.js /
  // config.store.js / window.location).
  const auth = {
    selectFreePlan: vi.fn(async (_planKey: string) => {}),
    changePlan: vi.fn(async (_planKey: string, _price: PriceOfferSdk) => {}),
    startCheckout: vi.fn(
      async (
        _planKey: string,
        _price: PriceOfferSdk,
        _urls: { successUrl: string; cancelUrl: string },
      ) => ({ sessionId: null as string | null, checkoutUrl: null as string | null }),
    ),
  };
  const loadSubscription = vi.fn(async () => {});
  const navigate = vi.fn((_url: string) => {});
  const origin = 'http://localhost:5173';

  // Mirrored component state.
  const state = {
    picking: false,
    pickError: null as string | null,
    confirmTarget: null as { plan: PlanDef; price: PriceOfferSdk } | null,
    confirmBusy: false,
    confirmError: null as string | null,
    successNotice: null as string | null,
  };
  let successTimer: ReturnType<typeof setTimeout> | undefined;

  function formatPrice(price: PriceOfferSdk): string {
    return price.amount === 0
      ? 'Free'
      : `${price.amount} ${price.currency.toUpperCase()} / ${price.recurrenceInterval}`;
  }

  function showSuccess(message: string): void {
    state.successNotice = message;
    clearTimeout(successTimer);
    successTimer = setTimeout(() => (state.successNotice = null), 6000);
  }

  async function confirmPlanChange(): Promise<void> {
    if (!state.confirmTarget) return;
    const { plan, price } = state.confirmTarget;
    state.confirmBusy = true;
    state.confirmError = null;
    try {
      await auth.changePlan(plan.key, price);
      await loadSubscription();
      state.confirmTarget = null;
      showSuccess(`You're now on ${plan.name} (${formatPrice(price)}).`);
      onSelect?.({ plan, price });
    } catch (err) {
      // AC: failure surfaces inside the dialog, not just a banner.
      state.confirmError = err instanceof Error ? err.message : 'Plan change failed';
    } finally {
      state.confirmBusy = false;
    }
  }

  async function handlePick(plan: PlanDef, price: PriceOfferSdk): Promise<void> {
    state.picking = true;
    state.pickError = null;
    try {
      if (price.amount === 0 && !plan.hasCost) {
        // Free plan — select directly (TBP-275 guards metered $0-base plans).
        await auth.selectFreePlan(plan.key);
        await loadSubscription();
        onSelect?.({ plan, price });
      } else if (status?.paymentsEnabled) {
        // Instant switch — requires explicit confirmation (TBP-33).
        state.confirmTarget = { plan, price };
        state.confirmError = null;
      } else {
        const base = callbackUrl ?? `${origin}/auth/oauth-callback`;
        const successUrl = `${base}?stripe_success=1&session_id={CHECKOUT_SESSION_ID}&redirect=${encodeURIComponent(successRedirect)}`;
        const cancelUrl = `${base}?stripe_cancel=1&redirect=${encodeURIComponent(cancelRedirect)}`;
        const session = await auth.startCheckout(plan.key, price, { successUrl, cancelUrl });
        if (session.sessionId === null) {
          await loadSubscription();
          onSelect?.({ plan, price });
        } else {
          if (!session.checkoutUrl) throw new Error('Checkout session URL missing');
          navigate(session.checkoutUrl);
        }
      }
    } catch (err) {
      state.pickError = err instanceof Error ? err.message : 'Something went wrong';
    } finally {
      state.picking = false;
    }
  }

  function cancelConfirm(): void {
    // Mirror of the dialog's Cancel button: onclick={() => (confirmTarget = null)}
    state.confirmTarget = null;
  }

  return { state, auth, loadSubscription, navigate, handlePick, confirmPlanChange, cancelConfirm };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const price = (
  amount: number,
  recurrenceInterval: BillingInterval,
  currency = 'usd',
): PriceOfferSdk => ({ id: `${recurrenceInterval}-${amount}`, amount, currency, recurrenceInterval });

const plan = (key: string, prices: PriceOfferSdk[], extra: Partial<PlanDef> = {}): PlanDef => ({
  key,
  name: key.charAt(0).toUpperCase() + key.slice(1),
  prices,
  ...extra,
});

const FREE_PLAN = plan('free', [price(0, 'month')]);
const PRO_PLAN = plan('pro', [price(29, 'month'), price(290, 'year')]);
const TEAM_PLAN = plan('team', [price(99, 'month'), price(990, 'year')]);
const MONTHLY_ONLY_PLAN = plan('starter', [price(9, 'month')]);
const METERED_ZERO_BASE_PLAN = plan('usage', [price(0, 'month')], { hasCost: true });

// ── TBP-34: annual default interval + fallback ───────────────────────────────

describe('PlanSelector interval selection (TBP-34)', () => {
  describe('availableIntervals', () => {
    it('collects only intervals with paid prices, in stable day→week→month→year order', () => {
      const plans = [
        plan('a', [price(290, 'year'), price(29, 'month')]),
        plan('b', [price(2, 'week')]),
      ];
      expect(availableIntervals(plans)).toEqual(['week', 'month', 'year']);
    });

    it('ignores free (amount-0) prices — they are interval-agnostic and never add a tab', () => {
      expect(availableIntervals([FREE_PLAN])).toEqual([]);
      expect(availableIntervals([FREE_PLAN, MONTHLY_ONLY_PLAN])).toEqual(['month']);
    });

    it('returns [] for null or empty plan lists', () => {
      expect(availableIntervals(null)).toEqual([]);
      expect(availableIntervals([])).toEqual([]);
    });
  });

  describe('selectedInterval default', () => {
    it("defaults to 'year' when yearly prices exist (annual is the default tab)", () => {
      expect(selectedInterval([PRO_PLAN, TEAM_PLAN], 'year')).toBe('year');
    });

    it('falls back to the first available interval when no plan offers yearly', () => {
      expect(selectedInterval([MONTHLY_ONLY_PLAN], 'year')).toBe('month');
    });

    it('falls back to the requested default itself when no paid intervals exist at all', () => {
      // Free-only app: no tabs are rendered, the value is inert but must not crash.
      expect(selectedInterval([FREE_PLAN], 'year')).toBe('year');
      expect(selectedInterval(null, 'year')).toBe('year');
    });

    it('honors a non-year defaultInterval prop when available', () => {
      expect(selectedInterval([PRO_PLAN], 'month')).toBe('month');
    });
  });

  describe('selectedInterval user override', () => {
    it('uses the user-picked tab when it is still available', () => {
      expect(selectedInterval([PRO_PLAN], 'year', 'month')).toBe('month');
    });

    it('discards an override that no longer matches any paid price (reconciles to default)', () => {
      // e.g. plans reloaded and weekly prices disappeared.
      expect(selectedInterval([PRO_PLAN], 'year', 'week')).toBe('year');
    });
  });

  describe('showIntervalTabs', () => {
    it('hides the toggle when fewer than two intervals are offered', () => {
      expect(showIntervalTabs([MONTHLY_ONLY_PLAN])).toBe(false);
      expect(showIntervalTabs([FREE_PLAN])).toBe(false);
      expect(showIntervalTabs(null)).toBe(false);
    });

    it('shows the toggle when two or more intervals are offered', () => {
      expect(showIntervalTabs([PRO_PLAN])).toBe(true);
    });
  });

  describe('pricesForInterval', () => {
    it('shows only the active-interval price plus interval-agnostic free prices', () => {
      const mixed = plan('mixed', [price(0, 'month'), price(29, 'month'), price(290, 'year')]);
      expect(pricesForInterval(mixed, 'year').map((p) => p.id)).toEqual([
        'month-0',
        'year-290',
      ]);
      expect(pricesForInterval(mixed, 'month').map((p) => p.id)).toEqual([
        'month-0',
        'month-29',
      ]);
    });

    it('returns [] for a paid-only plan not offered under the active interval', () => {
      expect(pricesForInterval(MONTHLY_ONLY_PLAN, 'year')).toEqual([]);
    });
  });
});

// ── TBP-33: plan-change confirmation flow ────────────────────────────────────

describe('PlanSelector pick flow + confirmation dialog (TBP-33)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('free plan (single-click, no confirmation)', () => {
    it('calls selectFreePlan immediately and never opens the dialog', async () => {
      const onSelect = vi.fn();
      const h = makeHarness({ status: { paymentsEnabled: true }, onSelect });
      await h.handlePick(FREE_PLAN, FREE_PLAN.prices[0]);

      expect(h.auth.selectFreePlan).toHaveBeenCalledExactlyOnceWith('free');
      expect(h.auth.changePlan).not.toHaveBeenCalled();
      expect(h.auth.startCheckout).not.toHaveBeenCalled();
      expect(h.loadSubscription).toHaveBeenCalledOnce();
      expect(h.state.confirmTarget).toBeNull();
      expect(onSelect).toHaveBeenCalledExactlyOnceWith({
        plan: FREE_PLAN,
        price: FREE_PLAN.prices[0],
      });
    });

    it('TBP-275: a $0-base plan with hasCost is NOT treated as free — it needs confirm/checkout', async () => {
      const h = makeHarness({ status: { paymentsEnabled: true } });
      await h.handlePick(METERED_ZERO_BASE_PLAN, METERED_ZERO_BASE_PLAN.prices[0]);

      expect(h.auth.selectFreePlan).not.toHaveBeenCalled();
      expect(h.state.confirmTarget).toEqual({
        plan: METERED_ZERO_BASE_PLAN,
        price: METERED_ZERO_BASE_PLAN.prices[0],
      });
    });
  });

  describe('paid pick with paymentsEnabled (confirmation gate)', () => {
    it('opens the dialog and does NOT call changePlan until confirmed', async () => {
      const onSelect = vi.fn();
      const h = makeHarness({ status: { paymentsEnabled: true }, onSelect });
      await h.handlePick(PRO_PLAN, PRO_PLAN.prices[1]);

      expect(h.state.confirmTarget).toEqual({ plan: PRO_PLAN, price: PRO_PLAN.prices[1] });
      expect(h.state.confirmError).toBeNull();
      expect(h.auth.changePlan).not.toHaveBeenCalled();
      expect(h.auth.startCheckout).not.toHaveBeenCalled();
      expect(h.loadSubscription).not.toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('re-opening the dialog clears a stale confirmError from a previous attempt', async () => {
      const h = makeHarness({ status: { paymentsEnabled: true } });
      h.state.confirmError = 'old failure';
      await h.handlePick(PRO_PLAN, PRO_PLAN.prices[0]);
      expect(h.state.confirmError).toBeNull();
    });

    it('cancel closes the dialog without ever calling changePlan', async () => {
      const h = makeHarness({ status: { paymentsEnabled: true } });
      await h.handlePick(PRO_PLAN, PRO_PLAN.prices[0]);
      h.cancelConfirm();

      expect(h.state.confirmTarget).toBeNull();
      expect(h.auth.changePlan).not.toHaveBeenCalled();

      // A later confirm click on the closed dialog must be a no-op.
      await h.confirmPlanChange();
      expect(h.auth.changePlan).not.toHaveBeenCalled();
    });
  });

  describe('confirmPlanChange success', () => {
    it('calls changePlan with the picked plan/price, refreshes, closes, notifies', async () => {
      const onSelect = vi.fn();
      const h = makeHarness({ status: { paymentsEnabled: true }, onSelect });
      await h.handlePick(PRO_PLAN, PRO_PLAN.prices[1]); // 290 usd / year
      await h.confirmPlanChange();

      expect(h.auth.changePlan).toHaveBeenCalledExactlyOnceWith('pro', PRO_PLAN.prices[1]);
      expect(h.loadSubscription).toHaveBeenCalledOnce();
      expect(h.state.confirmTarget).toBeNull();
      expect(h.state.confirmBusy).toBe(false);
      expect(h.state.confirmError).toBeNull();
      expect(h.state.successNotice).toBe("You're now on Pro (290 USD / year).");
      expect(onSelect).toHaveBeenCalledExactlyOnceWith({
        plan: PRO_PLAN,
        price: PRO_PLAN.prices[1],
      });
    });

    it('auto-dismisses the success notice after 6 seconds', async () => {
      const h = makeHarness({ status: { paymentsEnabled: true } });
      await h.handlePick(PRO_PLAN, PRO_PLAN.prices[0]);
      await h.confirmPlanChange();
      expect(h.state.successNotice).not.toBeNull();

      vi.advanceTimersByTime(5999);
      expect(h.state.successNotice).not.toBeNull();
      vi.advanceTimersByTime(1);
      expect(h.state.successNotice).toBeNull();
    });
  });

  describe('confirmPlanChange failure', () => {
    it('keeps the dialog open with the error inside it — no crash, no success path', async () => {
      const onSelect = vi.fn();
      const h = makeHarness({ status: { paymentsEnabled: true }, onSelect });
      h.auth.changePlan.mockRejectedValueOnce(new Error('card declined'));

      await h.handlePick(PRO_PLAN, PRO_PLAN.prices[0]);
      await expect(h.confirmPlanChange()).resolves.toBeUndefined();

      expect(h.state.confirmError).toBe('card declined');
      expect(h.state.confirmTarget).toEqual({ plan: PRO_PLAN, price: PRO_PLAN.prices[0] });
      expect(h.state.confirmBusy).toBe(false);
      expect(h.state.successNotice).toBeNull();
      expect(h.loadSubscription).not.toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('falls back to a generic message for non-Error rejections', async () => {
      const h = makeHarness({ status: { paymentsEnabled: true } });
      h.auth.changePlan.mockRejectedValueOnce('boom');

      await h.handlePick(PRO_PLAN, PRO_PLAN.prices[0]);
      await h.confirmPlanChange();
      expect(h.state.confirmError).toBe('Plan change failed');
    });

    it('retry after failure succeeds and closes the dialog', async () => {
      const h = makeHarness({ status: { paymentsEnabled: true } });
      h.auth.changePlan.mockRejectedValueOnce(new Error('transient'));

      await h.handlePick(PRO_PLAN, PRO_PLAN.prices[0]);
      await h.confirmPlanChange();
      expect(h.state.confirmError).toBe('transient');

      await h.confirmPlanChange();
      expect(h.auth.changePlan).toHaveBeenCalledTimes(2);
      expect(h.state.confirmTarget).toBeNull();
      expect(h.state.confirmError).toBeNull();
      expect(h.state.successNotice).toContain("You're now on Pro");
    });
  });

  describe('paid pick without paymentsEnabled (checkout keeps single-click behavior)', () => {
    it('goes straight to startCheckout — no confirmation dialog', async () => {
      const h = makeHarness({ status: { paymentsEnabled: false } });
      h.auth.startCheckout.mockResolvedValueOnce({
        sessionId: 'cs_123',
        checkoutUrl: 'https://checkout.stripe.test/cs_123',
      });

      await h.handlePick(PRO_PLAN, PRO_PLAN.prices[0]);

      expect(h.state.confirmTarget).toBeNull();
      expect(h.auth.changePlan).not.toHaveBeenCalled();
      expect(h.auth.startCheckout).toHaveBeenCalledOnce();
      expect(h.navigate).toHaveBeenCalledExactlyOnceWith('https://checkout.stripe.test/cs_123');
    });

    it('sessionId === null (Stripe not configured) refreshes and fires onSelect directly', async () => {
      const onSelect = vi.fn();
      const h = makeHarness({ status: null, onSelect });
      h.auth.startCheckout.mockResolvedValueOnce({ sessionId: null, checkoutUrl: null });

      await h.handlePick(PRO_PLAN, PRO_PLAN.prices[0]);

      expect(h.loadSubscription).toHaveBeenCalledOnce();
      expect(h.navigate).not.toHaveBeenCalled();
      expect(onSelect).toHaveBeenCalledExactlyOnceWith({ plan: PRO_PLAN, price: PRO_PLAN.prices[0] });
    });

    it('a session without a checkoutUrl surfaces a pickError banner', async () => {
      const h = makeHarness({ status: null });
      h.auth.startCheckout.mockResolvedValueOnce({ sessionId: 'cs_456', checkoutUrl: null });

      await h.handlePick(PRO_PLAN, PRO_PLAN.prices[0]);

      expect(h.state.pickError).toBe('Checkout session URL missing');
      expect(h.navigate).not.toHaveBeenCalled();
      expect(h.state.picking).toBe(false);
    });
  });
});
