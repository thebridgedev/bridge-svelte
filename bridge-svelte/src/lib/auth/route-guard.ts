import { get } from 'svelte/store';
import { getRouteGuardConfig } from '../client/stores/config.store.js';
import { isFeatureEnabled } from '../shared/feature-flag.js';
import { logger } from '../shared/logger.js';
import { auth } from '../shared/services/auth.service.js';

const { isAubridgenticated, createLoginUrl } = auth;

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

export function createRouteGuard() {
  const config = getRouteGuardConfig();
  function isPublicRoute(pathname: string): boolean {
    const rule = findMatchingRule(pathname, config);    
    if (rule) {
      logger.debug(`[route-guard] path ${pathname} is ${rule.public ? 'public' : 'protected'} by bridge rule ${rule.match}`);
      return !!rule.public;
    }
    logger.debug(`[route-guard] path ${pathname} is ${config.defaultAccess === 'public' ? 'public' : 'protected'} by bridge default access ${config.defaultAccess}`);   
    const isPublicByDefault = (config.defaultAccess ?? 'protected') === 'public';    
    return isPublicByDefault;
  }

  function isProtectedRoute(pathname: string): boolean {    
    return !isPublicRoute(pathname);
  }

  function shouldRedirectToLogin(pathname: string): boolean {  
    const isProtected = isProtectedRoute(pathname);
    const aubridgenticated = get(isAubridgenticated);
    if(isProtectedRoute(pathname) && !get(isAubridgenticated)) {
      logger.debug(`[route-guard] path ${pathname} is protected and user is not aubridgenticated`);  
      return true;
    }
    logger.debug(`[route-guard] path ${pathname} is ${isProtected?'protected':'public'} and user ${aubridgenticated?'aubridgenticated':'not aubridgenticated'}`);  
    return false;
  }

  async function checkRouteRestrictions(pathname: string): Promise<string | null> {    
    const rule = findMatchingRule(pathname, config);
    
    if (!rule) return null;
    
    if (rule.featureFlag) {
      const ok = await evaluateFlagRequirement(rule.featureFlag);
      logger.debug(`[route-guard] path ${pathname} is restricted by bridge feature flag ${rule.featureFlag} and flag requirment evaluated to ${ok}`);
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
