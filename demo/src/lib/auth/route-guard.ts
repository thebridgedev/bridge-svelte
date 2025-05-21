import { get } from 'svelte/store';
import { auth } from '@nblocks-svelte/shared/services/auth.service';

const { isAuthenticated, createLoginUrl } = auth;

export type PublicRoutePattern = string | RegExp;

export interface RouteGuardOptions {
  publicRoutes: PublicRoutePattern[];
}

export function createRouteGuard({ publicRoutes }: RouteGuardOptions) {
  function isPublicRoute(pathname: string): boolean {
    return publicRoutes.some((pattern) =>
      typeof pattern === 'string'
        ? pathname === pattern
        : pattern.test(pathname)
    );
  }

  function isProtectedRoute(pathname: string): boolean {
    return !isPublicRoute(pathname);
  }

  function shouldRedirectToLogin(pathname: string): boolean {
    return isProtectedRoute(pathname) && !get(isAuthenticated);
  }

  function getLoginRedirect(): string {
    return createLoginUrl();
  }

  return {
    isPublicRoute,
    isProtectedRoute,
    shouldRedirectToLogin,
    getLoginRedirect,
  };
}
