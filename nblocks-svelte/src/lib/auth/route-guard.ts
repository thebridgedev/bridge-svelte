import { get } from 'svelte/store';
import { isFeatureEnabled } from '../shared/feature-flag.js';
import { auth } from '../shared/services/auth.service.js';

const { isAuthenticated, createLoginUrl } = auth;

export type PublicRoutePattern = string | RegExp;

export type FlagRequirement =
  | string
  | { any: string[] }
  | { all: string[] };

export type RouteRule = {
  match: string | RegExp;
  public?: boolean; // default false => protected
  featureFlag?: FlagRequirement;
  redirectTo?: string; // used when feature flag requirement fails
};

export interface RouteGuardConfig {
  rules: RouteRule[];
  defaultAccess?: 'public' | 'protected';
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toRegExp(pattern: string | RegExp): RegExp {
  if (pattern instanceof RegExp) return pattern;
  // Support simple wildcard '*'
  const hasWildcard = pattern.includes('*');
  if (!hasWildcard) {
    return new RegExp(`^${escapeRegex(pattern)}$`);
  }
  const escaped = escapeRegex(pattern).replace(/\\\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function findMatchingRule(pathname: string, config: RouteGuardConfig): RouteRule | null {  
  for (const rule of config.rules) {    
    if (toRegExp(rule.match).test(pathname)) {      
      return rule;
    }
  }
  return null;
}

async function evaluateFlagRequirement(req: FlagRequirement): Promise<boolean> {  
  if (typeof req === 'string') {    
    return isFeatureEnabled(req);
  }
  if ('any' in req) {
    const results = await Promise.all(req.any.map((f) => isFeatureEnabled(f)));
    return results.some(Boolean);
  }
  if ('all' in req) {
    const results = await Promise.all(req.all.map((f) => isFeatureEnabled(f)));
    return results.every(Boolean);
  }
  return true;
}

export function createRouteGuard({ config }: { config: RouteGuardConfig }) {
  function isPublicRoute(pathname: string): boolean {
    const rule = findMatchingRule(pathname, config);
    if (rule) return !!rule.public;
    return (config.defaultAccess ?? 'protected') === 'public';
  }

  function isProtectedRoute(pathname: string): boolean {
    return !isPublicRoute(pathname);
  }

  function shouldRedirectToLogin(pathname: string): boolean {
    return isProtectedRoute(pathname) && !get(isAuthenticated);
  }

  async function checkRouteRestrictions(pathname: string): Promise<string | null> {    
    const rule = findMatchingRule(pathname, config);
    if (!rule) return null;    
    if (rule.featureFlag) {
      const ok = await evaluateFlagRequirement(rule.featureFlag);
      if (!ok) return rule.redirectTo ?? '/';
    }
    return null;
  }

  function getLoginRedirect(): string {
    return createLoginUrl();
  }

  return {
    isPublicRoute,
    isProtectedRoute,
    shouldRedirectToLogin,
    checkRouteRestrictions,
    getLoginRedirect,
    async getNavigationDecision(pathname: string): Promise<
      { type: 'allow' } |
      { type: 'login', loginUrl: string } |
      { type: 'redirect', to: string }
    > {
      if (shouldRedirectToLogin(pathname)) {
        return { type: 'login', loginUrl: getLoginRedirect() };
      }       
      const redirectTo = await checkRouteRestrictions(pathname);
      if (redirectTo) {
        return { type: 'redirect', to: redirectTo };
      }
      return { type: 'allow' };
    }
  };
}
