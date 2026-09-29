// TBP-762 — what <BridgeSubscriptionStatus> shows, as a pure decision.
//
// The rule: "Subscription unavailable" is the last resort. While the badge's
// own read (and its one retry, which also renews an out-of-date sign-in) is
// running it says "Loading…"; a plan it already holds stays on screen when a
// background re-read fails; only a read that failed with nothing to show
// becomes the error, and in debug mode the reason is shown beside it.

import type { BillingSubscriptionSnapshot } from '@nebulr-group/bridge-auth-core';

export type SubscriptionBadgeView =
  | { kind: 'loading' }
  | { kind: 'error'; reason: string | null }
  | { kind: 'plan'; name: string; status: string }
  | { kind: 'empty' };

export function subscriptionBadgeView(
  snapshot: BillingSubscriptionSnapshot,
  awaiting: boolean,
  debug: boolean,
): SubscriptionBadgeView {
  if (snapshot.loading || awaiting) return { kind: 'loading' };
  if (snapshot.state) {
    return { kind: 'plan', name: snapshot.state.plan.name, status: snapshot.state.status };
  }
  if (snapshot.error) return { kind: 'error', reason: debug ? snapshot.error : null };
  return { kind: 'empty' };
}
