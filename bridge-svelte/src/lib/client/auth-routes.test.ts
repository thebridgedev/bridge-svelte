// TBP-696 — the page list behind <BridgeAuthRoutes> and the load's 404.
import { describe, it, expect } from 'vitest';
import { BRIDGE_AUTH_PAGES, bridgeAuthBase, isBridgeAuthRouteId, parseBridgeAuthRoute } from './auth-routes.js';

describe('parseBridgeAuthRoute', () => {
  it('serves the seven guide pages plus workspaces', () => {
    expect([...BRIDGE_AUTH_PAGES].sort()).toEqual(
      ['forgot-password', 'login', 'magic-link', 'oauth-callback', 'set-password', 'setup-passkey', 'signup', 'workspaces'],
    );
  });

  it('reads a plain page', () => {
    expect(parseBridgeAuthRoute('login')).toEqual({ page: 'login' });
    expect(parseBridgeAuthRoute('workspaces')).toEqual({ page: 'workspaces' });
  });

  it('reads the email-link token — the signup verification address', () => {
    expect(parseBridgeAuthRoute('set-password/abc.DEF-123')).toEqual({ page: 'set-password', token: 'abc.DEF-123' });
    expect(parseBridgeAuthRoute('setup-passkey/t1')).toEqual({ page: 'setup-passkey', token: 't1' });
  });

  it('refuses half-matches, so they 404 instead of rendering a form', () => {
    for (const rest of ['', 'nope', 'login/x', 'set-password', 'setup-passkey', 'set-password/a/b', 'LOGIN']) {
      expect(parseBridgeAuthRoute(rest)).toBeNull();
    }
    expect(parseBridgeAuthRoute(undefined)).toBeNull();
  });
});

describe('isBridgeAuthRouteId', () => {
  it('matches only a [...bridge] rest param', () => {
    expect(isBridgeAuthRouteId('/auth/[...bridge]')).toBe(true);
    expect(isBridgeAuthRouteId('/account/[...bridge]')).toBe(true);
    expect(isBridgeAuthRouteId('/auth/[...rest]')).toBe(false);
    expect(isBridgeAuthRouteId('/auth/login')).toBe(false);
    expect(isBridgeAuthRouteId(null)).toBe(false);
  });
});

describe('bridgeAuthBase', () => {
  it('is the prefix the catch-all lives under', () => {
    expect(bridgeAuthBase('/auth/login', 'login')).toBe('/auth');
    expect(bridgeAuthBase('/auth/set-password/abc', 'set-password/abc')).toBe('/auth');
    expect(bridgeAuthBase('/account/sign/login/', 'login')).toBe('/account/sign');
    expect(bridgeAuthBase('/login', 'login')).toBe('');
  });

  it('counts segments, so an encoded token still yields the right prefix', () => {
    expect(bridgeAuthBase('/auth/set-password/a%2Bb', 'set-password/a+b')).toBe('/auth');
  });
});
