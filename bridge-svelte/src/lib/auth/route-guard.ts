// src/lib/auth/route-guard.ts — thin wrapper delegating to auth-core via bridge-instance
import { getBridgeAuth } from '../core/bridge-instance.js';
import { getConfig, getRouteGuardConfig } from '../client/stores/config.store.js';
import { logger } from '../shared/logger.js';
import { dropFlagCache, guardCacheGeneration } from './guard-cache.js';
import type { NavigationDecision, RouteGuardConfig, RouteRule } from '@nebulr-group/bridge-auth-core';

// Re-export types from auth-core
export type { FlagRequirement, NavigationDecision, RouteGuard, RouteGuardConfig, RouteRule } from '@nebulr-group/bridge-auth-core';

// How many times a restriction check is re-run when the cache was invalidated
// underneath it (TBP-654). Bounded so a burst of invalidations cannot spin.
const MAX_FRESH_READS = 3;

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

  // TBP-654 — a restriction check reads the flag cache. If the cache was
  // invalidated while the check was in flight (plan change, token refresh),
  // the answer may predate the change AND has just been written back into the
  // cache. Discard it and ask again.
  async function checkRestrictionsFresh(pathname: string): Promise<string | null> {
    for (let attempt = 1; ; attempt++) {
      const generation = guardCacheGeneration();
      const redirectTo = await guard.checkRouteRestrictions(pathname);
      if (generation === guardCacheGeneration()) return redirectTo;
      dropFlagCache();
      if (attempt >= MAX_FRESH_READS) return redirectTo;
    }
  }

  function loginDecision(pathname: string, attempted?: string): NavigationDecision {
    // TBP-629 — the attempted target (path + query) rides along on every
    // login decision, including the fail-closed ones below.
    let returnTo: string | null = null;
    try {
      returnTo = guard.resolveReturnTo(attempted ?? pathname);
    } catch {
      returnTo = null;
    }
    let loginUrl = '';
    try {
      loginUrl = guard.getLoginRedirect();
    } catch {
      // SDK mode never reads loginUrl; hosted mode rebuilds it at redirect time.
    }
    return { type: 'login', loginUrl, ...(returnTo ? { returnTo } : {}) };
  }

  // TBP-653 — the guard could not reach a decision (network error on a flag
  // check, malformed config, an exception anywhere in the chain). That must
  // never let a restricted route through:
  //   - a public route with no flag/billing requirement stays reachable;
  //   - a signed-out visitor is sent to login;
  //   - a signed-in user is treated as failing the route's requirement and
  //     sent where the rule says a failing user goes.
  function failClosed(pathname: string, attempted: string | undefined, err: unknown): NavigationDecision {
    logger.error('[route-guard] could not evaluate route; denying access', pathname, err);
    let rule: RouteRule | null = null;
    try {
      rule = findMatchingRule(pathname, config?.rules ?? []);
    } catch {
      rule = null;
    }
    const restricted = !!(rule?.featureFlag || rule?.billing === 'hard');
    let isPublic = false;
    try {
      isPublic = guard.isPublicRoute(pathname);
    } catch {
      isPublic = false;
    }
    if (isPublic && !restricted) return { type: 'allow' };

    let authenticated = false;
    try {
      authenticated = getBridgeAuth().isAuthenticated();
    } catch {
      authenticated = false;
    }
    if (authenticated) {
      const to = rule?.redirectTo ?? '/';
      if (to !== pathname) return { type: 'redirect', to };
    }
    return loginDecision(pathname, attempted);
  }

  return {
    ...guard,
    async checkRouteRestrictions(pathname: string): Promise<string | null> {
      await flagsReady;
      return checkRestrictionsFresh(pathname);
    },
    async getNavigationDecision(pathname: string, attempted?: string): Promise<NavigationDecision> {
      try {
        if (guard.shouldRedirectToLogin(pathname)) {
          // TBP-629 — this branch short-circuits before flagsReady on purpose
          // (an unauthenticated visitor needs no flag evaluation), which is
          // exactly why `attempted` has to be threaded through here too.
          return loginDecision(pathname, attempted);
        }
        await flagsReady;
        const redirectTo = await checkRestrictionsFresh(pathname);
        if (redirectTo) {
          return { type: 'redirect', to: redirectTo };
        }
        return { type: 'allow' };
      } catch (err) {
        return failClosed(pathname, attempted, err);
      }
    },
  };
}

// Same matching semantics as auth-core's route guard: a RegExp is tested as-is,
// a string is an exact match unless it contains `*` wildcards. First match wins.
function toRegExp(pattern: string | RegExp): RegExp {
  if (pattern instanceof RegExp) return pattern;
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!pattern.includes('*')) return new RegExp(`^${escaped}$`);
  return new RegExp(`^${escaped.replace(/\\\*/g, '.*')}$`);
}

function findMatchingRule(pathname: string, rules: RouteRule[]): RouteRule | null {
  for (const rule of rules) {
    if (toRegExp(rule.match).test(pathname)) return rule;
  }
  return null;
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
