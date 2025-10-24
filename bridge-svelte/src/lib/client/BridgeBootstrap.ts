// src/lib/bridge/bootstrap.ts

import { redirect } from '@sveltejs/kit';
import type { RouteGuardConfig } from '../auth/route-guard.js';
import { createRouteGuard } from '../auth/route-guard.js';
import { featureFlags } from '../shared/feature-flag.js';
import { logger } from '../shared/logger.js';
import { auth, maybeRefreshNow } from '../shared/services/auth.service.js';
import type { BridgeConfig } from '../shared/types/config.js';
import { bridgeConfig } from './stores/config.store.js';

export async function bridgeBootstrap(
  url: URL,
  config: BridgeConfig | string,
  routeConfig: RouteGuardConfig = { rules: [], defaultAccess: 'protected' }
) {
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
    
      if (code) {
        try {
          await handleCallback(code);
          // Redirect bridge user to bridge home page after bridge callback is handled
          redirect(303, '/');                    
        } catch (err) {      
          logger.error('Auth callback error:', err);
        }
      }    
      
    }
  } catch (e) {
    logger.warn('[bridgeBootstrap] failed parsing callbackUrl', e);
  }

  // 2. Ensure tokens are fresh if needed

  await maybeRefreshNow();

  // 3. Load feature flags before guard if your guard depends on bridgem
  await featureFlags.refresh();

  // 4. Handle route guarding and redirects
  
  const guard = createRouteGuard();  
  const decision = await guard.getNavigationDecision(url.pathname);
  logger.debug('[bridgeBootstrap] navigation decision', decision);
  if (decision.type === 'login') {
    redirect(303, auth.createLoginUrl());
  }
  if (decision.type === 'redirect' && url.pathname !== decision.to) {
    redirect(303, decision.to);
  }
    logger.debug('[bridgeBootstrap] in bridge end');
}