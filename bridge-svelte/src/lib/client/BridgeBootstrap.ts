// src/lib/bridge/bootstrap.ts

import { redirect, isRedirect } from '@sveltejs/kit';
import { get } from 'svelte/store';
import type { RouteGuardConfig } from '../auth/route-guard.js';
import { createRouteGuard } from '../auth/route-guard.js';
import {
  getBridgeAuth,
  bridgeReadyStore,
  markReady,
  waitForBridge as _waitForBridge,
} from '../core/bridge-instance.js';
import { installBridgeAuthFetch } from '../core/bridge-runtime.js';
import { useBridge } from '@nebulr-group/bridge-auth-core';
import { featureFlags } from '../shared/feature-flag.js';
import { logger } from '../shared/logger.js';
import type { BridgeConfig } from '../shared/types/config.js';
import { bridgeConfig, getConfig } from './stores/config.store.js';

export async function bridgeBootstrap(
  url: URL,
  config: BridgeConfig | string,
  routeConfig: RouteGuardConfig = { rules: [], defaultAccess: 'protected' },
  kitFetch?: typeof globalThis.fetch
) {
  // If we've already completed bootstrap once, short-circuit
  if (get(bridgeReadyStore)) {
    return;
  }

  const finalConfig = typeof config === 'string' ? { appId: config } : config;

  // Persist Stripe Checkout session_id to sessionStorage before any framework
  // redirects (e.g. SvelteKit goto) can strip it from the URL. auth-core's
  // getSubscriptionStatus() will pick it up and trigger a server-side sync.
  if (typeof sessionStorage !== 'undefined' && url.searchParams.has('session_id')) {
    sessionStorage.setItem('bridge_checkout_session_id', url.searchParams.get('session_id')!);
  }

  // 1. Initialize configuration (synchronously) — this also calls initBridge()
  bridgeConfig.initConfig(finalConfig, routeConfig);

  // 1b. Patch globalThis.fetch early so GraphQL/HTTP calls made in this load()
  //     function (before any component mounts) already carry the Bearer token.
  //     installBridgeAuthFetch() is idempotent — startBridgeRuntime() (onMount)
  //     is a no-op when it finds the patch already in place.
  installBridgeAuthFetch();

  // 1a. Unified callback handler — detects what is calling back and routes accordingly
  try {
    const resolvedCallbackUrl = getConfig().callbackUrl;
    const callbackPath = resolvedCallbackUrl ? new URL(resolvedCallbackUrl).pathname : null;
    if (callbackPath && url.pathname === callbackPath) {
      logger.debug('[bridgeBootstrap] callback route detected');

      const code          = url.searchParams.get('code');
      const sessionId     = url.searchParams.get('session_id');
      const stripeSuccess = url.searchParams.has('stripe_success');
      const stripeCancel  = url.searchParams.has('stripe_cancel');
      // Strip any session_id Stripe appends to the redirect param destination
      const rawRedirect   = url.searchParams.get('redirect') ?? '/subscription';
      const redirectTo    = rawRedirect.split('?')[0];

      if (code) {
        // OAuth callback
        const bridge = getBridgeAuth();
        try {
          logger.debug('[bridgeBootstrap] OAuth callback — calling handleCallback');
          // bridge-auth-core calls history.replaceState to strip ?code= from the URL.
          // SvelteKit intercepts replaceState as a navigation event, cancelling the
          // current load before our redirect can propagate. Use the native prototype
          // method directly so the URL is cleaned up without triggering SvelteKit's
          // navigation interceptor.
          const svelteReplaceState = history.replaceState;
          history.replaceState = History.prototype.replaceState.bind(history);
          try {
            await bridge.handleCallback(code);
          } finally {
            history.replaceState = svelteReplaceState;
          }
          const payment = url.searchParams.get('payment');
          redirect(303, payment ? `/?payment=${payment}` : '/');
        } catch (err) {
          if (isRedirect(err)) throw err;
          logger.error('[bridgeBootstrap] OAuth callback error:', err);
        }
      } else if (stripeSuccess && sessionId) {
        // Stripe payment success — verify with bridge-api (server calls Stripe directly),
        // then refresh tokens so the new JWT has shouldSelectPlan: false before redirect.
        logger.debug('[bridgeBootstrap] Stripe success callback — confirming with bridge-api');
        const bridge = getBridgeAuth();
        const ctx = bridge.getApiContext();
        try {
          const res = await (kitFetch ?? fetch)(`${ctx.apiBaseUrl}/v1/account/stripe/confirm-checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, appId: ctx.appId }),
          });
          if (!res.ok) {
            logger.warn('[bridgeBootstrap] confirm-checkout failed', res.status);
            redirect(303, getConfig().billing?.paymentErrorRoute ?? '/payment-error');
          }
          await bridge.refreshTokens();
          redirect(303, redirectTo);
        } catch (err) {
          if (isRedirect(err)) throw err;
          logger.warn('[bridgeBootstrap] confirm-checkout error', err);
          redirect(303, getConfig().billing?.paymentErrorRoute ?? '/payment-error');
        }
      } else if (stripeCancel) {
        // Stripe payment cancelled
        logger.debug('[bridgeBootstrap] Stripe cancel callback — redirecting to', redirectTo);
        redirect(303, redirectTo);
      } else {
        logger.warn('[bridgeBootstrap] callback route reached with no recognised signal');
      }
    }
  } catch (e) {
    if (isRedirect(e)) throw e;
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

  // 2b. Paywall redirect — fires before any page renders. Reads shouldSelectPlan
  //     and paymentsAutoRedirect from getSubscriptionStatus(). Only redirects when:
  //     - billing.paywallRoute is configured
  //     - the current path is not already the paywall route (no redirect loop)
  //     - the tenant is authenticated but has not selected a plan
  //     - the app has not opted out via paymentsAutoRedirect: false
  try {
    const paywallRoute = getConfig().billing?.paywallRoute;
    if (paywallRoute && url.pathname !== paywallRoute) {
      const bridge = getBridgeAuth();
      if (bridge.isAuthenticated()) {
        const status = await bridge.getSubscriptionStatus();
        if (status?.shouldSelectPlan === true && status?.paymentsAutoRedirect !== false) {
          logger.debug('[bridgeBootstrap] paywall redirect', paywallRoute);
          redirect(303, paywallRoute);
        }
      }
    }
  } catch (e) {
    if (isRedirect(e)) throw e;
    // Non-fatal — fail open if subscription fetch errors
  }

  // 2c. Auto-manage billing state so the notice/gate render without the
  //     integrator wiring a mount, and `hard` billing route rules can decide.
  try {
    const bridge = getBridgeAuth();
    const ctx = bridge.getApiContext();
    if (ctx.accessToken) {
      await useBridge().subscription.mount({
        apiBaseUrl: ctx.apiBaseUrl,
        accessToken: ctx.accessToken,
        appId: ctx.appId,
      });
    }
  } catch {
    // Non-fatal — gate fails open; the notice hydrates lazily on first render.
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
