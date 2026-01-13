// src/lib/bridge/bootstrap.ts

import { isRedirect, redirect } from '@sveltejs/kit';
import { get, writable } from 'svelte/store';
import type { RouteGuardConfig } from '../auth/route-guard.js';
import { createRouteGuard } from '../auth/route-guard.js';
import { featureFlags } from '../shared/feature-flag.js';
import { logger } from '../shared/logger.js';
import { auth, maybeRefreshNow } from '../shared/services/auth.service.js';
import type { BridgeConfig } from '../shared/types/config.js';
import { bridgeConfig } from './stores/config.store.js';

const bridgeReadyStore = writable(false);
let resolveReady: (() => void) | null = null;
const bridgeReadyPromise = new Promise<void>((resolve) => {
  resolveReady = resolve;
});

function markBridgeReady() {
  if (get(bridgeReadyStore)) return;
  bridgeReadyStore.set(true);
  resolveReady?.();
}

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

  // 1. Initialize configuration (synchronously)
  bridgeConfig.initConfig(finalConfig, routeConfig);
  // 1a. If we're on bridge OAuth callback route, let bridge dedicated route handle it
  try {
    const callbackPath = finalConfig.callbackUrl ? new URL(finalConfig.callbackUrl).pathname : null;
    if (callbackPath && url.pathname === callbackPath) {
      logger.debug('[bridgeBootstrap] callback route detected, skipping bootstrap flow');
      
 
      const { handleCallback } = auth;
      const code = url.searchParams.get('code');
      logger.debug('[bridgeBootstrap] callback code check', { hasCode: !!code, pathname: url.pathname });
    
      if (code) {
        try {
          logger.debug('[bridgeBootstrap] calling handleCallback');
          await handleCallback(code);
          // Verify tokens before redirect
          const tokensAfterCallback = auth.getToken();
          const isAuthAfterCallback = !!tokensAfterCallback?.accessToken;
          logger.debug('[bridgeBootstrap] after handleCallback', { 
            hasTokens: !!tokensAfterCallback?.accessToken,
            isAuthenticated: isAuthAfterCallback 
          });
          // Redirect bridge user to bridge home page after bridge callback is handled
          logger.debug('[bridgeBootstrap] redirecting to /');
          redirect(303, '/');                    
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

  await maybeRefreshNow();

  // 3. Load feature flags before guard if your guard depends on bridgem
  await featureFlags.refresh();

  // 4. Handle route guarding and redirects
  
  const guard = createRouteGuard();
  // Check auth state before route guard decision
  const currentTokens = auth.getToken();
  const currentAuth = !!currentTokens?.accessToken;
  logger.debug('[bridgeBootstrap] before route guard check', { 
    pathname: url.pathname,
    hasTokens: !!currentTokens?.accessToken,
    isAuthenticated: currentAuth 
  });
  const decision = await guard.getNavigationDecision(url.pathname);
  logger.debug('[bridgeBootstrap] navigation decision', decision);
  if (decision.type === 'login') {
    redirect(303, auth.createLoginUrl());
  }
  if (decision.type === 'redirect' && url.pathname !== decision.to) {
    redirect(303, decision.to);
  }
  logger.debug('[bridgeBootstrap] in bridge end');
  markBridgeReady();
}

export const bridgeReady = bridgeReadyStore;
export function waitForBridge(): Promise<void> {
  return bridgeReadyPromise;
}