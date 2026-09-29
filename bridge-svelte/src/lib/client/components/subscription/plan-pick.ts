// What happens when someone picks a plan on <PlanSelector>.
//
// TBP-762 — a Free pick (or a paid pick on an app without Stripe, which Bridge
// sets directly) used to re-read the subscription and then do nothing unless
// the page passed `onSelect`: the person was left on the plan picker, looking
// as if nothing had happened. It now goes on exactly like a paid pick does —
// to `successRedirect`, where a Stripe checkout returns — unless the page took
// over with `onSelect`. Every pick that changed the plan re-reads the billing
// store (plan list, current plan, billing state) first, so the next page shows
// the new plan.

import type { Plan, PriceOfferSdk } from '@nebulr-group/bridge-auth-core';

export interface PlanPickAuth {
  selectFreePlan(planKey: string): Promise<unknown>;
  startCheckout(
    planKey: string,
    price: PriceOfferSdk,
    urls: { successUrl: string; cancelUrl: string },
  ): Promise<{ sessionId: string | null; checkoutUrl?: string | null }>;
}

export interface PlanPickOptions {
  /** The workspace already pays: a switch is instant and needs a confirm step. */
  paymentsEnabled: boolean;
  successRedirect: string;
  cancelRedirect: string;
  /** The OAuth callback URL Stripe returns to. */
  callbackBase: string;
  onSelect?: (detail: { plan: Plan; price: PriceOfferSdk }) => void;
}

export interface PlanPickDeps {
  auth: PlanPickAuth;
  /** Re-read the billing store. */
  refresh: () => Promise<void>;
  /** In-app navigation (SvelteKit `goto`). */
  navigate: (url: string) => unknown;
  /** Leave the app (Stripe checkout). */
  leave: (url: string) => void;
}

/** `selected`: the plan changed here. `confirm`: ask first. `checkout`: off to Stripe. */
export type PlanPickOutcome = 'selected' | 'confirm' | 'checkout';

/** A $0 price on a plan with no metered cost is picked without checkout. */
export function isFreePick(plan: Plan, price: PriceOfferSdk): boolean {
  return price.amount === 0 && !(plan as Plan & { hasCost?: boolean }).hasCost;
}

export async function pickPlan(
  plan: Plan,
  price: PriceOfferSdk,
  opts: PlanPickOptions,
  deps: PlanPickDeps,
): Promise<PlanPickOutcome> {
  if (isFreePick(plan, price)) {
    // TBP-275: a $0-base plan with METERED pricing is not free — it goes
    // through checkout below so a payment method is captured.
    await deps.auth.selectFreePlan(plan.key);
    await deps.refresh();
    await settle(plan, price, opts, deps);
    return 'selected';
  }
  if (opts.paymentsEnabled) return 'confirm';

  // {CHECKOUT_SESSION_ID} is substituted by Stripe in place (no double `?`).
  const successUrl = `${opts.callbackBase}?stripe_success=1&session_id={CHECKOUT_SESSION_ID}&redirect=${encodeURIComponent(opts.successRedirect)}`;
  const cancelUrl = `${opts.callbackBase}?stripe_cancel=1&redirect=${encodeURIComponent(opts.cancelRedirect)}`;
  const session = await deps.auth.startCheckout(plan.key, price, { successUrl, cancelUrl });
  if (session.sessionId === null) {
    // Stripe not configured — Bridge set the plan directly.
    await deps.refresh();
    await settle(plan, price, opts, deps);
    return 'selected';
  }
  if (!session.checkoutUrl) throw new Error('Checkout session URL missing');
  deps.leave(session.checkoutUrl);
  return 'checkout';
}

async function settle(
  plan: Plan,
  price: PriceOfferSdk,
  opts: PlanPickOptions,
  deps: PlanPickDeps,
): Promise<void> {
  if (opts.onSelect) {
    opts.onSelect({ plan, price });
    return;
  }
  await deps.navigate(opts.successRedirect);
}
