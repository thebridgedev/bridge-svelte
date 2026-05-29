<script lang="ts">
  import { beforeNavigate, goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import { createRouteGuard } from '../auth/route-guard.js';
  import { getBridgeAuth } from '../core/bridge-instance.js';
  import { bridge as bridgeSurface } from '../core/bridge.js';
  import { setBridgeContext } from '../core/use-bridge.js';
  import { getConfig } from './stores/config.store.js';
  import {
    startBridgeRuntime,
    stopBridgeRuntime,
    type StartBridgeRuntimeOptions,
  } from '../core/bridge-runtime.js';
  import { loadSubscription, ensureAppConfig } from '../core/bridge-instance.js';

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

  async function handleRoute(pathname: string, cancel?: () => void) {
    const decision = await guard.getNavigationDecision(pathname);
    if (decision.type === 'login') {
      if (cancel) cancel();
      const { loginRoute } = getConfig();
      if (loginRoute) {
        goto(loginRoute);
      } else {
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

  // Stash a teardown for the dynamically-attached capabilities (today: flags).
  let _capabilityStop: (() => Promise<void>) | undefined;

  onMount(async () => {
    // Start the core runtime — realtime client, channel scoping, billing-store
    // attach, session.snapshot fanout, billing-family event dispatch.
    startBridgeRuntime(runtime);

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
    await handleRoute(to.url.pathname, cancel);
  });
</script>
