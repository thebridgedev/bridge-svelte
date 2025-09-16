// src/lib/nblocks/bootstrap.ts

import { redirect } from '@sveltejs/kit';
import { logger } from '../shared/logger.js';
import type { RouteGuardConfig } from '../auth/route-guard.js';
import { createRouteGuard } from '../auth/route-guard.js';
import { nblocksConfig } from '../client/stores/config.store.js';
import { featureFlags } from '../shared/feature-flag.js';
import { auth, maybeRefreshNow } from '../shared/services/auth.service.js';
import type { NblocksConfig } from '../shared/types/config.js';

export async function nblocksBootstrap(url: URL, config: NblocksConfig, routeConfig: RouteGuardConfig) {
 
  // 1. Initialize configuration (synchronously)
  nblocksConfig.initConfig(config, routeConfig);   
  // 1a. If we're on the OAuth callback route, let the dedicated route handle it
  try {
    const callbackPath = config.callbackUrl ? new URL(config.callbackUrl).pathname : null;
    if (callbackPath && url.pathname === callbackPath) {
      logger.debug('[nblocksBootstrap] callback route detected, skipping bootstrap flow');
           
      const { handleCallback } = auth;
      const code = url.searchParams.get('code');
    
      if (code) {
        try {
          await handleCallback(code);
          // Redirect the user to the home page after the callback is handled
          window.location.href = '/';                    
        } catch (err) {      
          logger.error('Auth callback error:', err);
        }
      }    
      
    }
  } catch (e) {
    logger.warn('[nblocksBootstrap] failed parsing callbackUrl', e);
  }

  // 2. Ensure tokens are fresh if needed

  await maybeRefreshNow();

  // 3. Load feature flags before guard if your guard depends on them
  await featureFlags.refresh();

  // 4. Handle route guarding and redirects
  
  const guard = createRouteGuard();  
  const decision = await guard.getNavigationDecision(url.pathname);
  logger.debug('[nblocksBootstrap] navigation decision', decision);
  if (decision.type === 'login') {
    throw redirect(303, auth.createLoginUrl());
  }
  if (decision.type === 'redirect' && url.pathname !== decision.to) {
    throw redirect(303, decision.to);
  }
    logger.debug('[nblocksBootstrap] in the end');
}