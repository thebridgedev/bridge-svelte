// src/lib/auth/route-guard.ts — thin wrapper delegating to auth-core via bridge-instance
import { getBridgeAuth } from '../core/bridge-instance.js';
import { getConfig, getRouteGuardConfig } from '../client/stores/config.store.js';
import type { RouteGuardConfig } from '@nebulr-group/bridge-auth-core';

// Re-export types from auth-core
export type { FlagRequirement, NavigationDecision, RouteGuard, RouteGuardConfig, RouteRule } from '@nebulr-group/bridge-auth-core';

export function createRouteGuard(flagsReady?: Promise<void>) {
  const config = getRouteGuardConfig();

  // TBP-629 — feed the app's own loginRoute into the guard so it can refuse to
  // make the login page its own return target. The consumer already told us
  // where their login page is via BridgeConfig; making them repeat it under
  // routeConfig.returnTo would be a second source of truth that can drift.
  // An explicit routeConfig value still wins.
  const { loginRoute } = getConfig();
  const guardConfig: RouteGuardConfig = {
    ...config,
    returnTo: {
      ...config?.returnTo,
      loginRoute: config?.returnTo?.loginRoute ?? loginRoute,
    },
  };

  const guard = getBridgeAuth().createRouteGuard(guardConfig);

  if (!flagsReady) return guard;

  // Wrap checkRouteRestrictions to await flagsReady before evaluating
  return {
    ...guard,
    async checkRouteRestrictions(pathname: string): Promise<string | null> {
      await flagsReady;
      return guard.checkRouteRestrictions(pathname);
    },
    async getNavigationDecision(pathname: string, attempted?: string) {
      if (guard.shouldRedirectToLogin(pathname)) {
        // TBP-629 — this branch short-circuits before flagsReady on purpose
        // (an unauthenticated visitor needs no flag evaluation), which is
        // exactly why `attempted` has to be threaded through here too. The
        // wrapper previously rebuilt the decision by hand and would silently
        // drop any argument auth-core's version learned to accept.
        const returnTo = guard.resolveReturnTo(attempted ?? pathname);
        return {
          type: 'login' as const,
          loginUrl: guard.getLoginRedirect(),
          ...(returnTo ? { returnTo } : {}),
        };
      }
      await flagsReady;
      const redirectTo = await guard.checkRouteRestrictions(pathname);
      if (redirectTo) {
        return { type: 'redirect' as const, to: redirectTo };
      }
      return { type: 'allow' as const };
    }
  };
}

/**
 * Does any route rule's `featureFlag` requirement mention this key?
 * (TBP-575.)
 *
 * The live re-check runs on every flag mutation the app receives, and most of
 * them have nothing to do with routing. Without this filter, flipping any flag
 * in a busy app would cost a `bulkEvaluate` round-trip on every connected
 * client — so this is a cost guard, not a correctness one.
 */
export function routeRulesReferenceFlag(key: string): boolean {
  const rules = getRouteGuardConfig()?.rules ?? [];
  return rules.some((rule) => {
    const req = rule.featureFlag;
    if (!req) return false;
    if (typeof req === 'string') return req === key;
    if ('any' in req) return req.any.includes(key);
    if ('all' in req) return req.all.includes(key);
    return false;
  });
}
