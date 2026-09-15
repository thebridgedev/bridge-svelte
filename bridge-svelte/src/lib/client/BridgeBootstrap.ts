// src/lib/bridge/bootstrap.ts

import { redirect, isRedirect } from '@sveltejs/kit';
import { get } from 'svelte/store';
import type { RouteGuardConfig } from '../auth/route-guard.js';
import { createRouteGuard } from '../auth/route-guard.js';
import { dropFlagCache, guardCacheGeneration } from '../auth/guard-cache.js';
import {
  getBridgeAuth,
  bridgeReadyStore,
  markReady,
  waitForBridge as _waitForBridge,
} from '../core/bridge-instance.js';
import { installBridgeAuthFetch } from '../core/bridge-runtime.js';
import {
  useBridge,
  sanitizeReturnTo,
  stashReturnTo,
  takeReturnTo,
  withReturnTo,
} from '@nebulr-group/bridge-auth-core';
import { logger } from '../shared/logger.js';
import type { BridgeConfig } from '../shared/types/config.js';
import { bridgeConfig, getConfig, getRouteGuardConfig } from './stores/config.store.js';

// TBP-653 — `bridgeBootstrap` used to short-circuit on every call after the
// first completed one, and the route guard lived below that return. SvelteKit
// re-runs the root layout load for every navigation (it reads `url`), so the
// load-level guard was evaluated exactly once per page load: a `load` that
// redirected from a public entry URL into a protected one during the first
// navigation — before <BridgeBootstrap>'s beforeNavigate guard has mounted —
// was checked by nobody.
//
// The expensive work (config, fetch patch, token refresh, billing mount, flag
// warm-up) is still once per page load, memoised below. The route guard runs
// on EVERY call; there is no state in which skipping it is correct.
let _configured = false;
let _initialisation: Promise<{ flagsReady: Promise<void> }> | null = null;
let _resolveConfigured: (() => void) | null = null;
const _configuredPromise = new Promise<void>((resolve) => {
  _resolveConfigured = resolve;
});

// How long `assertAuthorized` waits for `bridgeBootstrap` to configure the SDK.
// Child loads can start before the root layout load has run; this only has to
// cover that ordering, not a missing bootstrap.
const CONFIGURE_TIMEOUT_MS = 10_000;

export async function bridgeBootstrap(
  url: URL,
  config: BridgeConfig | string,
  routeConfig: RouteGuardConfig = { rules: [], defaultAccess: 'protected' },
  kitFetch?: typeof globalThis.fetch
) {
  // Until one call has completed, a call may be the one that lands on a
  // callback URL or needs the no-flash paywall redirect. Afterwards those are
  // owned by <BridgeBootstrap> (reactive paywall) — same split as before.
  const booting = !get(bridgeReadyStore);

  if (!_configured) {
    configureOnce(url, config, routeConfig);
  }

  if (booting) {
    await handleCallbackRoute(url, kitFetch);
  }

  const { flagsReady } = await ensureInitialised();

  if (booting) {
    await enforcePaywall(url);
  }

  await enforceRouteGuard(url, flagsReady);

  logger.debug('[bridgeBootstrap] in bridge end');
  markReady();
  return { flagsReady };
}

/**
 * Re-check Bridge's route rules for `url` from any `load` function, and throw
 * the same redirect `bridgeBootstrap` would: to your `loginRoute` (or the hosted
 * login page) for a signed-out visitor on a protected route, or to the rule's
 * `redirectTo` when a feature-flag or billing requirement is not met.
 *
 * `bridgeBootstrap` in your root `+layout.ts` already guards every navigation.
 * Use this as a second line of defence on pages that must never render for the
 * wrong visitor. It fails closed: if the decision cannot be made, a protected
 * route is denied.
 *
 * Route guards control what the browser renders. They are not authorization —
 * your API must still verify the user's token on every request.
 *
 * @example
 * // src/routes/admin/+page.ts
 * import { assertAuthorized } from '@nebulr-group/bridge-svelte';
 * export const load = async ({ url }) => {
 *   await assertAuthorized(url);
 *   // ...
 * };
 */
export async function assertAuthorized(url: URL): Promise<void> {
  await waitForConfigured();
  const { flagsReady } = await ensureInitialised();
  await enforceRouteGuard(url, flagsReady);
}

export const bridgeReady = bridgeReadyStore;
export { _waitForBridge as waitForBridge };

// ── internals ────────────────────────────────────────────────────────────────

function configureOnce(url: URL, config: BridgeConfig | string, routeConfig: RouteGuardConfig): void {
  const finalConfig = typeof config === 'string' ? { appId: config } : config;

  // Persist Stripe Checkout session_id to sessionStorage before any framework
  // redirects (e.g. SvelteKit goto) can strip it from the URL. auth-core's
  // getSubscriptionStatus() will pick it up and trigger a server-side sync.
  if (typeof sessionStorage !== 'undefined' && url.searchParams.has('session_id')) {
    sessionStorage.setItem('bridge_checkout_session_id', url.searchParams.get('session_id')!);
  }

  // Initialize configuration (synchronously) — this also calls initBridge()
  bridgeConfig.initConfig(finalConfig, routeConfig);

  // Patch globalThis.fetch early so GraphQL/HTTP calls made in this load()
  // function (before any component mounts) already carry the Bearer token.
  // installBridgeAuthFetch() is idempotent — startBridgeRuntime() (onMount)
  // is a no-op when it finds the patch already in place.
  installBridgeAuthFetch();

  _configured = true;
  _resolveConfigured?.();
}

async function waitForConfigured(): Promise<void> {
  if (_configured) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            '[bridge] assertAuthorized() ran but bridgeBootstrap() never configured the SDK. ' +
              'Call bridgeBootstrap(url, config, routeConfig) in your root +layout.ts load.'
          )
        ),
      CONFIGURE_TIMEOUT_MS
    );
  });
  try {
    await Promise.race([_configuredPromise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Once per page load. Concurrent callers share the same promise, so a first
// navigation that redirects mid-bootstrap does not start a second refresh or
// flag load. Never rejects: every step is best-effort by design — none of them
// decides authorization, which is enforceRouteGuard's job alone.
function ensureInitialised(): Promise<{ flagsReady: Promise<void> }> {
  if (_initialisation) return _initialisation;
  _initialisation = (async () => {
    // Ensure tokens are fresh if needed
    try {
      const bridge = getBridgeAuth();
      if (bridge.isAuthenticated()) {
        await bridge.refreshTokens();
      }
    } catch {
      // Non-fatal — stale tokens will be caught by route guard
    }

    // Auto-manage billing state so the notice/gate render without the
    // integrator wiring a mount, and `hard` billing route rules can decide.
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
      // Non-fatal — the notice hydrates lazily on first render.
    }

    // Warm the route-guard's flag cache without awaiting so GQL queries can
    // start in parallel. `loadFeatureFlags()` populates the same auth-core
    // FeatureFlagService the route guard evaluates `featureFlag` rules
    // against. Errors are logged, never thrown here — a flag the guard needs
    // and cannot load is handled (fail closed) at evaluation time.
    //
    // TBP-654: if the cache was invalidated while this load was in flight
    // (sign-in, plan change), what it writes back predates the change — drop it.
    const generation = guardCacheGeneration();
    const flagsReady = getBridgeAuth()
      .loadFeatureFlags()
      .then(() => {
        if (generation !== guardCacheGeneration()) dropFlagCache();
      })
      .catch((err) => {
        logger.warn('[bridgeBootstrap] Feature flags failed to load:', err);
      });

    return { flagsReady };
  })();
  return _initialisation;
}

const STRIPE_DEFAULT_RETURN = '/subscription';

// Where a Stripe success/cancel return lands (TBP-659).
//
// The `redirect` parameter arrives on the app's own callback URL, so anyone can
// craft a link carrying it — no sign-in or Stripe session is needed to reach the
// cancel branch. It is untrusted input: only a same-origin path is followed, and
// anything auth-core's sanitizeReturnTo rejects (absolute URLs, `//` and `/\`
// protocol-relative forms, schemes such as `javascript:`, control characters)
// falls back to the default rather than being repaired.
//
// The query strip is kept on purpose. It arrived in 57dc474 together with the
// {CHECKOUT_SESSION_ID} placeholder in PlanSelector: before the placeholder the
// session id was appended as `?session_id=…` after `redirect=/path`, so it landed
// inside this value. A checkout started by an older build, or a success URL a
// consumer built for startCheckout themselves, can still come back in that shape,
// and the session id must not leak into the consumer's route. The cost — a query
// the consumer deliberately put on the target is dropped too — is unchanged
// behaviour, not new.
//
// Validation runs on the stripped string because that is the one we navigate to.
function stripeReturnTarget(url: URL): string {
  const raw = url.searchParams.get('redirect');
  if (raw === null) return STRIPE_DEFAULT_RETURN;
  return sanitizeReturnTo(raw.split('?')[0]) ?? STRIPE_DEFAULT_RETURN;
}

// Unified callback handler — detects what is calling back and routes accordingly
async function handleCallbackRoute(url: URL, kitFetch?: typeof globalThis.fetch): Promise<void> {
  try {
    const resolvedCallbackUrl = getConfig().callbackUrl;
    const callbackPath = resolvedCallbackUrl ? new URL(resolvedCallbackUrl).pathname : null;
    if (callbackPath && url.pathname === callbackPath) {
      logger.debug('[bridgeBootstrap] callback route detected');

      const code          = url.searchParams.get('code');
      const sessionId     = url.searchParams.get('session_id');
      const stripeSuccess = url.searchParams.has('stripe_success');
      const stripeCancel  = url.searchParams.has('stripe_cancel');
      const redirectTo    = stripeReturnTarget(url);

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
          // TBP-629 — this line used to hard-code '/', which is where hosted
          // mode lost the deep link even though the OAuth round-trip itself
          // worked fine. `takeReturnTo()` is one-shot and re-sanitizes, and
          // returns null when nothing was stashed, so the old behaviour is
          // exactly what happens when there is no deep link to restore.
          //
          // `payment` wins: it signals a just-completed checkout whose landing
          // page the billing flow owns, and that is a deliberate destination
          // rather than a remembered one.
          const stashedReturnTo = takeReturnTo();
          redirect(
            303,
            payment ? `/?payment=${payment}` : (stashedReturnTo ?? '/'),
          );
        } catch (err) {
          if (isRedirect(err)) throw err;
          logger.error('[bridgeBootstrap] OAuth callback error:', err);
        }
      } else if (stripeSuccess && sessionId) {
        // Stripe payment success — auth-core's confirmStripeCheckout() verifies the session
        // with bridge-api (server calls Stripe directly) and refreshes tokens so the new JWT
        // has shouldSelectPlan: false before we redirect. It throws on a non-OK response or
        // network error → we fall through to the payment-error redirect. (TBP-369: the HTTP +
        // token-refresh logic now lives in auth-core so every plugin port can reuse it.)
        logger.debug('[bridgeBootstrap] Stripe success callback — confirming with bridge-api');
        const bridge = getBridgeAuth();
        try {
          await bridge.confirmStripeCheckout(sessionId, kitFetch);
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
}

// Paywall redirect — fires before any page renders. The framework-agnostic
// decision (authenticated + shouldSelectPlan + not opted out via
// paymentsAutoRedirect) lives in auth-core's shouldRedirectToPaywall()
// (TBP-369). We only own the route/config guards here:
//   - billing.paywallRoute is configured
//   - the current path is not already the paywall route (no redirect loop)
async function enforcePaywall(url: URL): Promise<void> {
  try {
    const paywallRoute = getConfig().billing?.paywallRoute;
    if (paywallRoute && url.pathname !== paywallRoute) {
      const bridge = getBridgeAuth();
      if (await bridge.shouldRedirectToPaywall()) {
        logger.debug('[bridgeBootstrap] paywall redirect', paywallRoute);
        redirect(303, paywallRoute);
      }
    }
  } catch (e) {
    if (isRedirect(e)) throw e;
    // Non-fatal — billing fails open if the subscription fetch errors. This is
    // a plan-selection nudge, not an authorization decision.
  }
}

// The authorization decision. Runs on every bridgeBootstrap/assertAuthorized
// call. `getNavigationDecision` fails closed internally (route-guard.ts), so an
// error while deciding denies a protected route instead of skipping the check.
async function enforceRouteGuard(url: URL, flagsReady: Promise<void>): Promise<void> {
  const guard = createRouteGuard(flagsReady);
  const bridge = getBridgeAuth();
  logger.debug('[bridgeBootstrap] before route guard check', {
    pathname: url.pathname,
    isAuthenticated: !!bridge.getTokens()?.accessToken,
  });
  // TBP-629 — hand the guard the FULL attempted target, not just the pathname.
  // `?key=…` style query is part of the deep link for plenty of routes, and an
  // exported-file link that loses its query is as broken as one that loses its
  // path.
  const attempted = `${url.pathname}${url.search}`;
  const decision = await guard.getNavigationDecision(url.pathname, attempted);
  logger.debug('[bridgeBootstrap] navigation decision', decision);
  if (decision.type === 'login') {
    const { loginRoute } = getConfig();
    const returnToParam = getRouteGuardConfig()?.returnTo?.param;
    // SDK mode: consumer explicitly set loginRoute → redirect to in-app login view
    // Hosted mode (default): no loginRoute → redirect to hosted auth portal
    if (loginRoute) {
      redirect(303, withReturnTo(loginRoute, decision.returnTo, returnToParam));
    }
    // Hosted mode (TBP-629): the target CANNOT ride on the URL. `createLoginUrl()`
    // feeds `redirectUri` to the OAuth authorize call and bridge-api validates it
    // with an exact `allowedRedirectUris.includes()` match, so adding a query to
    // it would break login rather than improve it. Stash it instead and pick it
    // up at the callback — the OAuth request itself stays untouched.
    stashReturnTo(decision.returnTo);
    redirect(303, bridge.createLoginUrl());
  }
  if (decision.type === 'redirect' && url.pathname !== decision.to) {
    redirect(303, decision.to);
  }
}
