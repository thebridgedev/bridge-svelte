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
import { getBridgeAuth } from '../core/bridge-instance.js';

let _generation = 0;

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
