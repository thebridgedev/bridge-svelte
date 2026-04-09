// src/lib/auth/route-guard.ts — thin wrapper delegating to auth-core via bridge-instance
import { getBridgeAuth } from '../core/bridge-instance.js';
import { getRouteGuardConfig } from '../client/stores/config.store.js';

// Re-export types from auth-core
export type { FlagRequirement, NavigationDecision, RouteGuard, RouteGuardConfig, RouteRule } from '@nebulr-group/bridge-auth-core';

export function createRouteGuard(flagsReady?: Promise<void>) {
  const config = getRouteGuardConfig();
  const guard = getBridgeAuth().createRouteGuard(config);

  if (!flagsReady) return guard;

  // Wrap checkRouteRestrictions to await flagsReady before evaluating
  return {
    ...guard,
    async checkRouteRestrictions(pathname: string): Promise<string | null> {
      await flagsReady;
      return guard.checkRouteRestrictions(pathname);
    },
    async getNavigationDecision(pathname: string) {
      if (guard.shouldRedirectToLogin(pathname)) {
        return { type: 'login' as const, loginUrl: guard.getLoginRedirect() };
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
