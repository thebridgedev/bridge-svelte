<script lang="ts">
  import { beforeNavigate, goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
  import { createRouteGuard, routeRulesReferenceFlag } from '../auth/route-guard.js';
  import { stashReturnTo, withReturnTo } from '@nebulr-group/bridge-auth-core';
  import {
    getBridgeAuth,
    isAuthenticated,
    subscriptionStore,
    loadSubscription,
    ensureAppConfig,
  } from '../core/bridge-instance.js';
  import { bridge as bridgeSurface } from '../core/bridge.js';
  import { setBridgeContext } from '../core/use-bridge.js';
  import { getConfig, getRouteGuardConfig } from './stores/config.store.js';
  import {
    onBridgeFlagChange,
    startBridgeRuntime,
    stopBridgeRuntime,
    type StartBridgeRuntimeOptions,
  } from '../core/bridge-runtime.js';

  // Props: optional `runtime` overrides for advanced/debug use (websocketFactory,
  // reconnect overrides, etc.); `onBootstrapComplete` callback fires after the
  // runtime + any auto-detected capabilities (flags) have attached.
  let {
    runtime,
    onBootstrapComplete,
  }: {
    runtime?: StartBridgeRuntimeOptions;
    onBootstrapComplete?: () => void;
  } = $props();

  // Phase 4 (TBP-288/320) — expose the unified bridge surface via Svelte
  // context so descendants can call `useBridge()`.
  setBridgeContext(bridgeSurface);

  const guard = createRouteGuard();

  // Reactive paywall enforcement.
  //
  // The one-shot redirect in bridgeBootstrap() (load) only fires on the very
  // first load — it short-circuits on every later navigation (bridgeReadyStore),
  // so it misses the post-login case where auth + subscription state resolve a
  // beat AFTER load() ran. This guard owns correctness: it actively loads the
  // subscription once known-authenticated, then redirects reactively whenever
  // `shouldSelectPlan` resolves true. Same data source as <BridgePaywall>, so the
  // overlay and the redirect agree. The load() redirect remains a no-flash
  // fast-path for direct loads/refreshes only.
  $effect(() => {
    const paywallRoute = getConfig().billing?.paywallRoute;
    if (!paywallRoute || !$isAuthenticated) return;

    const { status, loading, error } = $subscriptionStore;

    // Status unknown → trigger a single load. Guarding on `!error` avoids a
    // tight refetch loop on persistent failure (fail-pending, not fail-open);
    // a workspace switch resets the store and re-attempts.
    if (!status && !loading && !error) {
      loadSubscription().catch(() => { /* surfaced via store.error */ });
      return;
    }

    // Status known → enforce. `$page.url.pathname` makes this re-run on
    // navigation too, so manual nav to a protected page while plan-less is
    // also caught. Path guard prevents a redirect loop on the paywall itself.
    if (
      status?.shouldSelectPlan === true &&
      status?.paymentsAutoRedirect !== false &&
      $page.url.pathname !== paywallRoute
    ) {
      goto(paywallRoute);
    }
  });

  async function handleRoute(pathname: string, cancel?: () => void, search?: string) {
    // TBP-629 — client-side navigation loses the deep link the same way the
    // load-time path did. Fixing only BridgeBootstrap.ts would leave somebody
    // who clicks an in-app link into a protected route while their session is
    // gone landing on the default route, which is the same bug with a different
    // trigger.
    const attempted = `${pathname}${search ?? ''}`;
    const decision = await guard.getNavigationDecision(pathname, attempted);
    if (decision.type === 'login') {
      if (cancel) cancel();
      const { loginRoute } = getConfig();
      if (loginRoute) {
        goto(withReturnTo(loginRoute, decision.returnTo, getRouteGuardConfig()?.returnTo?.param));
      } else {
        // Hosted mode (TBP-629) — stash before handing off to the portal; the
        // callback in BridgeBootstrap.ts picks it up. Same reason as there: the
        // OAuth redirectUri is exact-matched server-side and must not be touched.
        stashReturnTo(decision.returnTo);
        getBridgeAuth().login();
      }
      return;
    }
    if (decision.type === 'redirect' && window.location.pathname !== decision.to) {
      if (cancel) cancel();
      window.location.href = decision.to;
      return;
    }
  }

  // TBP-575 — re-evaluate the CURRENT route when a flag it depends on changes.
  //
  // Route rules are only evaluated on navigation. Without this, flipping a
  // flag off never ejects the user sitting on the route it gates — they keep
  // the page until they happen to navigate. That makes a route flag useless as
  // a kill switch, which is most of the reason to put a flag on a route.
  //
  // Debounced because one admin action can emit several flag messages, and
  // each re-check costs a bulkEvaluate round-trip.
  let _recheckTimer: ReturnType<typeof setTimeout> | undefined;
  let _stopFlagWatch: (() => void) | undefined;

  function scheduleRouteRecheck() {
    if (_recheckTimer) clearTimeout(_recheckTimer);
    _recheckTimer = setTimeout(() => {
      _recheckTimer = undefined;
      // No `cancel` here: there is no navigation in flight to cancel. A denied
      // verdict redirects the user off the page they are already on.
      handleRoute(window.location.pathname, undefined, window.location.search).catch(() => {
        /* a failed re-check must never break the page; the next navigation
           re-evaluates anyway */
      });
    }, 150);
  }

  // Stash a teardown for the dynamically-attached capabilities (today: flags).
  let _capabilityStop: (() => Promise<void>) | undefined;

  onMount(async () => {
    // Start the core runtime — realtime client, channel scoping, billing-store
    // attach, session.snapshot fanout, billing-family event dispatch.
    startBridgeRuntime(runtime);

    // TBP-575 — subscribe AFTER the runtime exists so the hook is registered
    // on the live client. Filtered to keys the route rules actually name; a
    // flag nothing routes on must not cost every client a round-trip.
    _stopFlagWatch = onBridgeFlagChange((change) => {
      if (routeRulesReferenceFlag(change.key)) scheduleRouteRecheck();
    });

    // Fetch app config outside load() so we use the correct fetch context.
    // LoginForm also calls ensureAppConfig() — both share the same in-flight promise.
    void ensureAppConfig();

    // Sync subscription when landing on any page after Stripe checkout success.
    // BridgeBootstrap.ts runs server-side where sessionStorage is unavailable,
    // so we write it here (client onMount) before calling loadSubscription().
    const sessionId = new URLSearchParams(window.location.search).get('session_id');
    if (sessionId) {
      sessionStorage.setItem('bridge_checkout_session_id', sessionId);
      loadSubscription().catch(() => { /* non-fatal */ });
    }

    // Auto-detect Feature Flags 2.0. If `@nebulr-group/bridge-svelte/flags` is
    // on the dependency graph, attach the flag-specific runtime onto the
    // already-started core (BridgeFlags instance, attribute providers,
    // telemetry, hydrate, reactivity). The dynamic import means auth-only apps
    // never pull the flags bundle.
    try {
      const flagsMod = await import('../flags/bootstrap.js');
      const bundle = flagsMod.createBridgeFlags();
      _capabilityStop = bundle.stop;
    } catch {
      // /flags entry not installed — auth-only app, skip flag attach.
    }

    // Auth-core manages auto-refresh internally — no startAutoRefresh() needed
    if (onBootstrapComplete) onBootstrapComplete();
  });

  onDestroy(() => {
    if (_recheckTimer) {
      clearTimeout(_recheckTimer);
      _recheckTimer = undefined;
    }
    _stopFlagWatch?.();
    _stopFlagWatch = undefined;
    void (async () => {
      if (_capabilityStop) {
        try { await _capabilityStop(); } catch { /* ignore */ }
        _capabilityStop = undefined;
      }
      await stopBridgeRuntime();
    })();
  });

  beforeNavigate(async ({ to, cancel }) => {
    if (!to) return;
    await handleRoute(to.url.pathname, cancel, to.url.search);
  });
</script>
