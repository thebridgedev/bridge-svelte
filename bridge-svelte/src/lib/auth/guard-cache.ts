// Route-guard cache invalidation (TBP-654). Internal — not re-exported.
//
// Route guards read auth-core's FeatureFlagService, a cache with a 5-minute
// TTL. A plan-targeted rule's verdict depends on the user's plan and token, not
// on the flag definition, so anything that can change those has to drop the
// cache — otherwise an upgraded user stays locked out of the page they just
// paid for until the TTL runs out.
//
// The generation counter exists for one race: an evaluation that was already
// in flight when the cache was invalidated writes its (pre-change) result back
// into the cache when it lands, with a fresh timestamp. Callers compare the
// generation before and after reading the cache and re-read when it moved.
//
// The pending-change promise exists for a second race: the page learns about a
// plan change (and shows the new plan) a few hundred ms before the token that
// carries it arrives. A route decision taken in that window is evaluated with
// the old token and refuses the page the user can already see they have. The
// runtime registers the token refresh an authorization-affecting event starts;
// guards wait for it, bounded, before deciding.
import { getBridgeAuth } from '../core/bridge-instance.js';

/**
 * How long a route decision waits for the token refresh a plan, entitlements or
 * user-state change started. Past it the guard decides with the token it has,
 * which for a protected route is the old (fail-closed) verdict.
 */
export const AUTHORIZATION_CHANGE_WAIT_MS = 3_000;

let _generation = 0;
let _pendingChange: Promise<void> | null = null;

/** Drop the route-guard flag cache so the next route evaluation asks the server again. */
export function invalidateRouteGuardCache(): void {
  _generation += 1;
  dropFlagCache();
}

/** Current cache generation; changes on every `invalidateRouteGuardCache()`. */
export function guardCacheGeneration(): number {
  return _generation;
}

/**
 * Drop the underlying cache WITHOUT bumping the generation — used to discard a
 * result that landed after an invalidation, which is not itself a new change.
 */
export function dropFlagCache(): void {
  try {
    getBridgeAuth().invalidateFeatureFlagCache();
  } catch {
    // BridgeAuth not initialised yet — there is no cache to drop.
  }
}

/**
 * Register the token refresh started by an authorization-affecting event.
 * The tracked promise never rejects; it clears itself once settled.
 */
export function trackAuthorizationChange(refresh: Promise<unknown>): Promise<void> {
  const tracked: Promise<void> = refresh.then(
    () => undefined,
    () => undefined,
  ).finally(() => {
    if (_pendingChange === tracked) _pendingChange = null;
  });
  _pendingChange = tracked;
  return tracked;
}

/** The refresh in flight for an authorization change, or `null` when there is none. */
export function pendingAuthorizationChange(): Promise<void> | null {
  return _pendingChange;
}

/** Forget any pending change (runtime stop / test reset). */
export function clearPendingAuthorizationChange(): void {
  _pendingChange = null;
}

/**
 * Wait until no authorization-change refresh is in flight, or until `deadline`
 * (epoch ms). Never throws. Returns immediately — without yielding — when
 * nothing is pending, so a signed-out visitor's navigation is not delayed.
 */
export async function settleAuthorizationChange(deadline: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // A change that lands while we wait (a second event after the first
    // refresh finished) starts a new refresh; wait for that too, within the
    // same deadline.
    for (let pending = _pendingChange; pending; pending = _pendingChange) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return;
      const expired = await Promise.race([
        pending.then(() => false),
        new Promise<true>((resolve) => {
          timer = setTimeout(() => resolve(true), remaining);
        }),
      ]);
      clearTimeout(timer);
      if (expired) return;
      if (_pendingChange === pending) return; // settled but not yet cleared
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}
