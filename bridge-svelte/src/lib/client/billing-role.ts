// Who may act on a plan limit, and what a member who may not is told.
//
// One source for <BridgeQuotaBanner> and <BridgeUpgradeDialog> (TBP-703), so
// the two never disagree about who gets an Upgrade button and what everyone
// else reads. The rule is the banner's original one: the Upgrade call to
// action is for whoever `canManageBilling()` says may manage billing (v1: the
// workspace owner); anyone else — including when Bridge is not initialised —
// is a member and is told to contact the workspace owner instead of being
// sent to a subscription page they cannot act on.

import { getBridgeAuth } from '../core/bridge-instance.js';

/** True when the signed-in user may manage this workspace's billing. Fails closed to "member". */
export function isBillingAdmin(): boolean {
  try {
    return getBridgeAuth().canManageBilling() === true;
  } catch {
    // No BridgeAuth instance — the member variant.
    return false;
  }
}

/** Where a member is pointed, in place of an Upgrade button. */
export const CONTACT_WORKSPACE_OWNER = 'Contact your workspace owner.';

/**
 * The member-facing sentence for a quota, by how close it is to the cap.
 * `over` is also what a refused request (the upgrade dialog) says. `reached`
 * (TBP-697): exactly at a hard limit — 2 of 2 is not "approaching".
 */
export function quotaMemberBody(
  label: string,
  state: 'over' | 'reached' | 'critical' | 'approaching',
): string {
  switch (state) {
    case 'over':
      return `Your workspace is over its ${label} cap. ${CONTACT_WORKSPACE_OWNER}`;
    case 'reached':
      return `Your workspace has reached its ${label} limit. ${CONTACT_WORKSPACE_OWNER}`;
    case 'critical':
      return `Your workspace is approaching its ${label} cap. ${CONTACT_WORKSPACE_OWNER}`;
    case 'approaching':
      return `Your workspace is approaching its ${label} cap.`;
  }
}
