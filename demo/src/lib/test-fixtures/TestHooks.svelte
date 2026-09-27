<!--
  TEST FIXTURES ONLY — not part of the reference integration.

  What the e2e suite reads off the page, in DEBUG builds (VITE_BRIDGE_DEBUG)
  only; renders nothing otherwise:
    - `window.bridge`                 the unified surface (TBP-325/326)
    - `window.__ff2RefreshTokens()`   FF 2.0 release validation (TBP-241)
    - `window.__bridgeBootstrapCompleteAt`  when Bridge reported ready (TBP-695),
      stamped by `onBootstrapComplete`, which the layout passes to
      <BridgeBootstrap> through `testBootstrapProps`
    - `[data-testid="rt-status"]`     the realtime status store (FF 2.0 #27)
    - `[data-testid="bridge-app-id"]` / `[data-testid="bridge-env"]`  the app id
      Bridge initialised with and the Vite environment, which global-setup
      checks before a run (TBP-604, TBP-607)
-->
<script lang="ts" module>
  const DEBUG = import.meta.env.VITE_BRIDGE_DEBUG === 'true';

  /** Spread onto <BridgeBootstrap>. Empty outside DEBUG. */
  export const testBootstrapProps: { onBootstrapComplete?: () => void } = DEBUG
    ? {
        onBootstrapComplete: () => {
          (window as unknown as { __bridgeBootstrapCompleteAt?: number }).__bridgeBootstrapCompleteAt =
            performance.now();
        },
      }
    : {};
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { bridge, getBridgeAuth, getConfig, realtimeStatus } from '@nebulr-group/bridge-svelte';

  const env = (import.meta.env.VITE_ENVIRONMENT as string | undefined) || 'local';
  const appId = (() => {
    try {
      return getConfig().appId;
    } catch {
      return '';
    }
  })();

  async function refreshTokens() {
    try {
      await getBridgeAuth().refreshTokens();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  onMount(() => {
    if (!DEBUG) return;
    Object.assign(window, { bridge, __ff2RefreshTokens: refreshTokens });
  });
</script>

{#if DEBUG}
  <span class="rt-status-pill" data-testid="rt-status">{$realtimeStatus}</span>
  <span hidden data-testid="bridge-app-id">{appId}</span>
  <span hidden data-testid="bridge-env" data-env={env}></span>
{/if}

<style>
  .rt-status-pill {
    position: fixed;
    bottom: 12px;
    right: 12px;
    z-index: 9999;
    padding: 4px 10px;
    border-radius: 20px;
    background: #f1f5f9;
    color: #475569;
    border: 1px solid #cbd5e1;
    font: 600 11px ui-monospace, monospace;
  }
</style>
