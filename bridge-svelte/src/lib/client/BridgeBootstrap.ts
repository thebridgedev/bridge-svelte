// src/lib/bridge/bootstrap.ts

import { isRedirect, redirect } from '@sveltejs/kit';
import { get } from 'svelte/store';
import type { RouteGuardConfig } from '../auth/route-guard.js';
import { createRouteGuard } from '../auth/route-guard.js';
import {
  getBridgeAuth,
  bridgeReadyStore,
  markReady,
  waitForBridge as _waitForBridge,
} from '../core/bridge-instance.js';
import { featureFlags } from '../shared/feature-flag.js';
import { logger } from '../shared/logger.js';
import type { BridgeConfig } from '../shared/types/config.js';
import { bridgeConfig, getConfig } from './stores/config.store.js';

export async function bridgeBootstrap(
  url: URL,
  config: BridgeConfig | string,
  routeConfig: RouteGuardConfig = { rules: [], defaultAccess: 'protected' }
) {
  // If we've already completed bootstrap once, short-circuit
  if (get(bridgeReadyStore)) {
    return;
  }

  const finalConfig = typeof config === 'string' ? { appId: config } : config;

  // 1. Initialize configuration (synchronously) — this also calls initBridge()
  bridgeConfig.initConfig(finalConfig, routeConfig);

  // 1a. If we're on bridge OAuth callback route, let bridge dedicated route handle it
  try {
    const resolvedCallbackUrl = getConfig().callbackUrl;
    const callbackPath = resolvedCallbackUrl ? new URL(resolvedCallbackUrl).pathname : null;
    if (callbackPath && url.pathname === callbackPath) {
      logger.debug('[bridgeBootstrap] callback route detected, skipping bootstrap flow');

      const bridge = getBridgeAuth();
      const code = url.searchParams.get('code');
      logger.debug('[bridgeBootstrap] callback code check', { hasCode: !!code, pathname: url.pathname });

      if (code) {
        try {
          logger.debug('[bridgeBootstrap] calling handleCallback');
          await bridge.handleCallback(code);
          // Verify tokens before redirect
          const tokensAfterCallback = bridge.getTokens();
          const isAuthAfterCallback = !!tokensAfterCallback?.accessToken;
          logger.debug('[bridgeBootstrap] after handleCallback', {
            hasTokens: !!tokensAfterCallback?.accessToken,
            isAuthenticated: isAuthAfterCallback
          });
          // Redirect bridge user to bridge home page after bridge callback is handled
          // Preserve payment status if present (from post-payment redirect)
          const payment = url.searchParams.get('payment');
          const redirectUrl = payment ? `/?payment=${payment}` : '/';
          logger.debug('[bridgeBootstrap] redirecting to', { redirectUrl, payment });
          redirect(303, redirectUrl);
        } catch (err) {
          if (isRedirect(err)) {
            throw err; // Re-throw redirect so SvelteKit can handle it
          }
          logger.error('[bridgeBootstrap] Auth callback error:', err);
        }
      } else {
        logger.warn('[bridgeBootstrap] callback route detected but no code parameter');
      }
    }
  } catch (e) {
    if (isRedirect(e)) {
      throw e; // Re-throw redirect so SvelteKit can handle it
    }
    logger.warn('[bridgeBootstrap] failed parsing callbackUrl', e);
  }

  // 2. Ensure tokens are fresh if needed
  try {
    const bridge = getBridgeAuth();
    if (bridge.isAuthenticated()) {
      await bridge.refreshTokens();
    }
  } catch {
    // Non-fatal — stale tokens will be caught by route guard
  }

  // 3. Fire flag fetch without awaiting so GQL queries can start in parallel.
  //    The flagsReady promise is passed to the guard and returned to callers
  //    so routes that need flags can still await before rendering.
  //    Swallow errors — feature flag failures should never crash the bootstrap.
  const flagsReady = featureFlags.refresh().catch((err) => {
    logger.warn('[bridgeBootstrap] Feature flags failed to load:', err);
  });

  // 4. Handle route guarding and redirects
  const guard = createRouteGuard(flagsReady);
  const bridge = getBridgeAuth();
  const currentTokens = bridge.getTokens();
  const currentAuth = !!currentTokens?.accessToken;
  logger.debug('[bridgeBootstrap] before route guard check', {
    pathname: url.pathname,
    hasTokens: !!currentTokens?.accessToken,
    isAuthenticated: currentAuth
  });
  const decision = await guard.getNavigationDecision(url.pathname);
  logger.debug('[bridgeBootstrap] navigation decision', decision);
  if (decision.type === 'login') {
    const { loginRoute } = getConfig();
    // SDK mode: consumer explicitly set loginRoute → redirect to in-app login view
    // Hosted mode (default): no loginRoute → redirect to hosted auth portal
    redirect(303, loginRoute ?? bridge.createLoginUrl());
  }
  if (decision.type === 'redirect' && url.pathname !== decision.to) {
    redirect(303, decision.to);
  }
  logger.debug('[bridgeBootstrap] in bridge end');
  markReady();
  return { flagsReady };
}

export const bridgeReady = bridgeReadyStore;
export { _waitForBridge as waitForBridge };
