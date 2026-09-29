// What <BridgeQuotaBanner> says, as a pure decision (TBP-697).
//
// The owner's run on stage (2026-09-29): a hard quota at 2 of 2 read
// "approaching its clicks cap". The server answers `critical` from 95% and has
// no "reached" state for a hard quota (it sets `overcap` only for metered), and
// the banner's own fallback was `used > limit`, false at 2 > 2. At
// `used >= limit` on a hard quota the banner now says the limit is reached.

import type { QuotaSnapshot } from '@nebulr-group/bridge-auth-core';
import { quotaMemberBody } from './billing-role.js';

export type QuotaBannerState = 'hidden' | 'approaching' | 'critical' | 'reached' | 'over' | 'metered';

export interface QuotaBannerCopy {
  title: string;
  body: string;
  cta?: string;
}

/** Where a snapshot sits. Metered quotas bill instead of blocking and keep their own copy. */
export function quotaBannerState(snap: QuotaSnapshot | undefined): QuotaBannerState {
  if (!snap) return 'hidden';
  if (snap.policy === 'metered') {
    const overCap = snap.overcap ?? snap.used > snap.limit;
    return snap.warningLevel !== null || overCap ? 'metered' : 'hidden';
  }
  if (snap.limit > 0 && snap.used > snap.limit) return 'over';
  if (snap.limit > 0 && snap.used >= snap.limit) return 'reached';
  if (snap.warningLevel === 'critical') return 'critical';
  if (snap.warningLevel === 'approaching') return 'approaching';
  return 'hidden';
}

/** Format an estimated cost like "$1.00" / "1.00 SEK". */
export function formatCost(amount: number | undefined, currency: string | undefined): string {
  if (amount === undefined) return '';
  const cur = (currency ?? '').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'USD' }).format(amount);
  } catch {
    // Unknown currency code → fall back to "<amount> <CUR>".
    return `${amount.toFixed(2)}${cur ? ` ${cur}` : ''}`;
  }
}

export function quotaBannerCopy(
  snap: QuotaSnapshot | undefined,
  admin: boolean,
  label: string,
): QuotaBannerCopy {
  const state = quotaBannerState(snap);
  if (!snap || state === 'hidden') return { title: '', body: '' };

  // TBP-275 — metered: live usage + projected cost, never a blocking message.
  if (state === 'metered') {
    const overUnits = snap.limit > 0 ? Math.max(0, snap.used - snap.limit) : snap.used;
    const cost = formatCost(snap.overageEstimate, snap.currency);
    const costSuffix = cost ? ` · ~${cost} estimated this period` : '';
    if (snap.limit > 0) {
      if (overUnits > 0) {
        return {
          title: `${label} overage`,
          body: `${overUnits.toLocaleString()} over your ${snap.limit.toLocaleString()} included${costSuffix}.`,
        };
      }
      const unit = formatCost(snap.unitAmount, snap.currency);
      return {
        title: `${label} approaching included limit`,
        body: `You've used ${snap.used.toLocaleString()} of ${snap.limit.toLocaleString()} included${unit ? ` — extra usage is billed at ${unit}/unit` : ''}.`,
      };
    }
    // pure per-unit (limit 0) — billed from unit 1
    return { title: `${label} usage`, body: `${snap.used.toLocaleString()} ${label}${costSuffix}.` };
  }

  const used = snap.used.toLocaleString();
  const limit = snap.limit.toLocaleString();
  const remaining = Math.max(0, snap.remaining).toLocaleString();
  switch (state) {
    case 'over':
      return admin
        ? { title: `${label} over cap`, body: `You've used ${used} of ${limit}. Upgrade your plan to add headroom.`, cta: 'Upgrade' }
        : { title: `${label} over cap`, body: quotaMemberBody(label, 'over') };
    case 'reached':
      return admin
        ? { title: `${label} limit reached`, body: `You've used all ${limit} on your plan. Upgrade your plan to add more.`, cta: 'Upgrade' }
        : { title: `${label} limit reached`, body: quotaMemberBody(label, 'reached') };
    case 'critical':
      return admin
        ? { title: `${label} near cap`, body: `You've used ${used} of ${limit} (${remaining} left). Upgrade to avoid hitting the cap.`, cta: 'Upgrade' }
        : { title: `${label} near cap`, body: quotaMemberBody(label, 'critical') };
    default:
      return admin
        ? { title: `${label} approaching cap`, body: `You've used ${used} of ${limit} (${remaining} left).`, cta: 'Upgrade' }
        : { title: `${label} approaching cap`, body: quotaMemberBody(label, 'approaching') };
  }
}
