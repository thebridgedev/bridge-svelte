<script lang="ts">
  import { beforeNavigate, goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount, onDestroy, type Snippet } from 'svelte';
  import { createRouteGuard, routeRulesReferenceFlag } from '../auth/route-guard.js';
  import { stashReturnTo, withReturnTo } from '@nebulr-group/bridge-auth-core';
  import {
    getBridgeAuth,
    bridgeReadyStore,
    isAuthenticated,
    subscriptionStore,
    loadSubscription,
    ensureAppConfig,
  } from '../core/bridge-instance.js';
  import { bridge as bridgeSurface } from '../core/bridge.js';
  import { setBridgeContext } from '../core/use-bridge.js';
  import { getConfig, getRouteGuardConfig } from './stores/config.store.js';
  import { appUsesBilling, billingRoutes, isPaywallExempt } from './billing-routes.js';
  import {
    onBridgeAuthorizationChange,
    onBridgeFlagChange,
    startBridgeRuntime,
    stopBridgeRuntime,
    type StartBridgeRuntimeOptions,
  } from '../core/bridge-runtime.js';
  import RealtimeDevBadge from './components/developer/RealtimeDevBadge.svelte';
  import { startBillingRefresh } from '../core/billing-store.js';
  import BridgeUpgradeDialog from './components/subscription/BridgeUpgradeDialog.svelte';
  import { dismissQuotaRefusal, quotaRefusal } from '../core/quota-refusal.js';
  import { dismissFeatureUpgrade, featureUpgrade, openFeatureUpgrade } from '../core/feature-upgrade.js';
  import { resolveUpgradeDialog, upgradeHrefFor } from './upgrade-dialog.js';
  import { isBillingAdmin } from './billing-role.js';

  // TBP-644 — the "Live updates off — why?" badge is mounted here so every app
  // gets it without code changes. It renders in development builds only;
  // `devBadge: false` in the config turns it off there too.
  const devBadgeEnabled = (() => {
    try {
      return getConfig().devBadge !== false;
    } catch {
      return true;
    }
  })();

  // TBP-703 — the upgrade dialog is mounted here so a page needs no Bridge code:
  // when the app's backend refuses a request at a plan limit (402
  // QUOTA_EXCEEDED), the fetch wrapper / bridgeFetch report it and this opens.
  // On by default; `billing.upgradeDialog: false` turns it off, a component
  // replaces it.
  const billingConfig = (() => {
    try {
      return getConfig().billing;
    } catch {
      return undefined;
    }
  })();
  const upgradeDialog = resolveUpgradeDialog(billingConfig);
  const UpgradeDialog = upgradeDialog === 'default' ? BridgeUpgradeDialog : upgradeDialog;
  // TBP-756 — the same dialog in its feature variant: a plan-gated route, a
  // <FeatureFlag> upgrade click, or a backend's 402 FEATURE_NOT_IN_PLAN. A plan
  // limit refusal wins when both are pending.
  const upgradeHref = $derived(upgradeHrefFor($quotaRefusal ?? $featureUpgrade, billingConfig));
  // Re-read for every refusal: the same owner rule as <BridgeQuotaBanner>.
  const canUpgrade = $derived($quotaRefusal || $featureUpgrade ? isBillingAdmin() : false);
  const upgradeFeature = $derived(
    $quotaRefusal ? null : ($featureUpgrade ? ($featureUpgrade.feature ?? $featureUpgrade.flag ?? '') : null),
  );
  // TBP-755/756 — the feature variant names the plans that include the
  // feature, from the plan list. Load it once when that variant opens.
  $effect(() => {
    if (!$featureUpgrade || !$isAuthenticated) return;
    const { plans, loading, error } = $subscriptionStore;
    if (!plans && !loading && !error) loadSubscription().catch(() => { /* the dialog still opens, without plan names */ });
  });
  function closeUpgradeDialog(): void {
    dismissQuotaRefusal();
    dismissFeatureUpgrade();
  }

  // Props: optional `runtime` overrides for advanced/debug use (websocketFactory,
  // reconnect overrides, etc.); `onBootstrapComplete` callback fires after the
  // runtime + any auto-detected capabilities (flags) have attached.
  //
  // TBP-695 — the shell owns readiness. Wrap the app in <BridgeBootstrap> and
  // `children` render only once Bridge is ready: the root `load`
  // (bridgeBootstrap) has finished AND the runtime + capabilities attached
  // below. The developer writes no ready flag. Self-closing use (no children)
  // still works for apps that gate on `onBootstrapComplete` themselves.
  let {
    runtime,
    onBootstrapComplete,
    children,
  }: {
    runtime?: StartBridgeRuntimeOptions;
    onBootstrapComplete?: () => void;
    children?: Snippet;
  } = $props();

  let runtimeAttached = $state(false);

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
  //
  // TBP-702 — the paywall defaults to `/subscription/plan` (served by
  // <BridgeBillingRoutes>); `billing.paywallRoute: false` turns it off.
  $effect(() => {
    const routes = billingRoutes();
    const paywallRoute = routes.paywallRoute;
    if (!paywallRoute || !$isAuthenticated) return;

    const { status, plans, loading, error } = $subscriptionStore;

    // Status unknown → trigger a single load. Guarding on `!error` avoids a
    // tight refetch loop on persistent failure (fail-pending, not fail-open);
    // a workspace switch resets the store and re-attempts.
    if (!status && !loading && !error) {
      loadSubscription().catch(() => { /* surfaced via store.error */ });
      return;
    }

    // Status known → enforce. `$page.url.pathname` makes this re-run on
    // navigation too, so manual nav to a protected page while plan-less is
    // also caught. Path guard prevents a redirect loop on the paywall itself,
    // and leaves the payment-error page readable.
    // TBP-702 — the default paywall only applies to an app that uses billing
    // (has plans); an explicit paywallRoute always applies.
    if (
      status?.shouldSelectPlan === true &&
      status?.paymentsAutoRedirect !== false &&
      (!routes.paywallIsDefault || appUsesBilling(plans)) &&
      !isPaywallExempt($page.url.pathname, routes)
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

    // TBP-653 — SvelteKit reads `cancel()` synchronously: once this callback
    // hits its first `await`, the navigation is already committed. The
    // signed-out check needs no network, so do it before awaiting and cancel
    // for real, rather than letting the protected route start loading and
    // superseding it afterwards. If the check itself throws, nothing is
    // cancelled here: the full decision below and the load-level guard in
    // bridgeBootstrap() both fail closed, and cancelling without a redirect
    // would strand a visitor who was heading somewhere public.
    if (cancel) {
      let signedOutOnProtected = false;
      try {
        signedOutOnProtected = guard.shouldRedirectToLogin(pathname);
      } catch {
        signedOutOnProtected = false;
      }
      if (signedOutOnProtected) cancel();
    }

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
    // TBP-756 — a plan-gated route opens the upgrade dialog instead of
    // silently bouncing. A navigation is handled by the route's load
    // (bridgeBootstrap), which keeps the visitor where they were; here only the
    // re-check of the page they are already on is left: it takes them to the
    // rule's redirectTo (client-side, so the dialog survives) and opens it.
    if (decision.type === 'redirect' && (decision as { reason?: string }).reason === 'plan') {
      if (cancel) return;
      const { flag, feature } = decision as { flag?: string; feature?: string };
      openFeatureUpgrade({ flag, feature });
      if (window.location.pathname !== decision.to) await goto(decision.to);
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
  let _stopAuthzWatch: (() => void) | undefined;
  let _stopBillingRefresh: (() => void) | undefined;

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

    // TBP-654 — a plan upgrade, entitlements change, user state change or new
    // token can flip a verdict without any flag changing. The runtime has
    // already invalidated the route-guard cache; re-check the current route
    // (debounced — these arrive in bursts) so a signed-out session leaves a
    // protected page and a revoked entitlement ejects the user.
    _stopAuthzWatch = onBridgeAuthorizationChange(() => scheduleRouteRecheck());

    // TBP-762 — the billing store's refresh rule: re-read the plan list,
    // current plan and billing state on a renewed sign-in and on tab focus
    // after 30 s (live billing events are wired in the runtime).
    _stopBillingRefresh = startBillingRefresh();

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
    runtimeAttached = true;
    if (onBootstrapComplete) onBootstrapComplete();
  });

  onDestroy(() => {
    _stopBillingRefresh?.();
    _stopBillingRefresh = undefined;
    if (_recheckTimer) {
      clearTimeout(_recheckTimer);
      _recheckTimer = undefined;
    }
    _stopFlagWatch?.();
    _stopFlagWatch = undefined;
    _stopAuthzWatch?.();
    _stopAuthzWatch = undefined;
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

<RealtimeDevBadge enabled={devBadgeEnabled} />

{#if UpgradeDialog}
  <UpgradeDialog refusal={$quotaRefusal} {upgradeHref} {canUpgrade} onclose={closeUpgradeDialog} feature={upgradeFeature} plans={$subscriptionStore.plans} />
{/if}

{#if runtimeAttached && $bridgeReadyStore}
  {@render children?.()}
{/if}
