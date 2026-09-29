// TBP-763 — seat limits on the built-in team page.
//
// Seats are a plan limit the app names (for example `seats`), a gauge Bridge
// counts from membership — active members plus pending invites, read fresh.
// Bridge's invite API does not refuse at the limit, so the team page runs the
// check itself when given the limit's name (`seatsMetric`):
//   - Invite is wrapped in <QuotaGate metric={seatsMetric}>, so it stops at the
//     plan's limit with a line saying why;
//   - one invite of several addresses cannot jump past the limit either;
//   - after an invite, removal, or enable/disable the seat quota is re-read,
//     so the gate follows the team (a live push may arrive too).

import { refreshQuota } from '../../../core/billing-store.js';

/**
 * Why an invite of `count` addresses is refused with `remaining` seats left,
 * or null when it fits. `remaining` null = unknown (loading / no limit): the
 * page does not guess — the gate is decoration, the limit is the plan's.
 */
export function inviteSeatError(count: number, remaining: number | null | undefined): string | null {
  if (remaining === null || remaining === undefined) return null;
  const left = Math.max(0, remaining);
  if (count <= left) return null;
  if (left === 0) return 'All seats on your plan are taken. Upgrade your plan to invite more people.';
  return `Your plan has ${left} ${left === 1 ? 'seat' : 'seats'} left, and this invites ${count}. Invite fewer people or upgrade your plan.`;
}

/** After the team changed: re-read the seat count, when the page counts seats. */
export function seatsChanged(seatsMetric: string | undefined): void {
  if (seatsMetric) refreshQuota(seatsMetric);
}
