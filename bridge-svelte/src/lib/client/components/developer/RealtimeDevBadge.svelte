<!--
  TBP-644 — development-only "Live updates off — why?" corner badge.

  <BridgeBootstrap /> mounts this automatically. It renders only in
  development builds (`dev` from `$app/environment`, which SvelteKit resolves
  to a constant `false` in production builds) and only while live updates are
  actually off: refused (`unauthorized`), connected but deaf (`degraded`), or
  retrying for longer than 30 s. Opt out with `devBadge: false` in
  `bridgeConfig.initConfig({...})`.

  Styling is self-contained — every element resets with `all: unset` — so it
  neither depends on nor inherits from the host app's CSS.
-->
<script lang="ts">
  import { dev } from '$app/environment';
  import { realtimeStatusDetail } from '../../../core/realtime-status.js';
  import {
    REALTIME_BADGE_RETRYING_AFTER_MS,
    createRetryClock,
    realtimeBadgeView,
  } from '../../../core/realtime-dev-badge.js';

  let { enabled = true }: { enabled?: boolean } = $props();

  const PANEL_ID = 'bridge-realtime-dev-badge-panel';
  const retryClock = createRetryClock();

  let now = $state(Date.now());
  let expanded = $state(false);
  let dismissedKey = $state<string | undefined>(undefined);
  let toggleEl = $state<HTMLButtonElement | undefined>(undefined);

  const status = $derived($realtimeStatusDetail);
  // Start of the current retry run — stable across the closed/connecting
  // flips inside one episode (see createRetryClock).
  const retryingSince = $derived(retryClock(status, Date.now()));

  // Tick `now` once the retrying threshold passes — nothing else re-renders.
  $effect(() => {
    if (retryingSince === undefined) return;
    const remaining = retryingSince + REALTIME_BADGE_RETRYING_AFTER_MS - Date.now();
    const timer = setTimeout(() => (now = Date.now()), Math.max(0, remaining) + 50);
    return () => clearTimeout(timer);
  });

  const view = $derived(realtimeBadgeView(status, retryingSince, now));
  const visible = $derived(!!view && view.key !== dismissedKey);

  function dismiss() {
    dismissedKey = view?.key;
    expanded = false;
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && expanded) {
      expanded = false;
      toggleEl?.focus();
    }
  }
</script>

{#if dev && enabled}
  <div class="bridge-rt-root" data-testid="bridge-realtime-dev-badge-root">
    <span class="bridge-rt-sr" role="status" aria-live="polite"
      >{visible && view ? `Bridge live updates are off: ${view.reason}` : ''}</span
    >
    {#if visible && view}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <aside
        class="bridge-rt-badge"
        aria-label="Bridge live updates (development only)"
        data-testid="bridge-realtime-dev-badge"
        onkeydown={onKeydown}
      >
        <div class="bridge-rt-bar">
          <button
            bind:this={toggleEl}
            type="button"
            class="bridge-rt-toggle"
            aria-expanded={expanded}
            aria-controls={PANEL_ID}
            onclick={() => (expanded = !expanded)}
          >
            <span class="bridge-rt-dot" aria-hidden="true">●</span> Live updates off — why?
          </button>
          <button
            type="button"
            class="bridge-rt-close"
            aria-label="Dismiss the live updates notice"
            onclick={dismiss}>×</button
          >
        </div>
        {#if expanded}
          <div id={PANEL_ID} class="bridge-rt-panel">
            <div class="bridge-rt-row">
              <span class="bridge-rt-label">Reason</span>
              <code class="bridge-rt-code">{view.reason}</code>
            </div>
            <div class="bridge-rt-row">
              <span class="bridge-rt-label">Whose side</span>
              <span class="bridge-rt-value">{view.sideLabel}</span>
            </div>
            {#if view.hint}
              <div class="bridge-rt-row">
                <span class="bridge-rt-label">Fix</span>
                <span class="bridge-rt-value" data-testid="bridge-realtime-dev-badge-hint">{view.hint}</span>
              </div>
            {/if}
            {#if view.ref}
              <div class="bridge-rt-row">
                <span class="bridge-rt-label">Ref</span>
                <code class="bridge-rt-code">{view.ref}</code>
              </div>
            {/if}
            {#if view.docsUrl}
              <a class="bridge-rt-link" href={view.docsUrl} target="_blank" rel="noopener noreferrer"
                >How to fix this ↗</a
              >
            {/if}
            <span class="bridge-rt-note">Development builds only — never shown to your users.</span>
          </div>
        {/if}
      </aside>
    {/if}
  </div>
{/if}

<style>
  .bridge-rt-root,
  .bridge-rt-root * {
    all: unset;
    box-sizing: border-box;
  }
  .bridge-rt-root {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 2147483000;
    display: block;
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    font-size: 12px;
    line-height: 1.4;
    color: #f5f5f5;
  }
  .bridge-rt-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .bridge-rt-badge {
    display: block;
    max-width: min(360px, calc(100vw - 32px));
    background: #1f2328;
    border: 1px solid #3d444d;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  }
  .bridge-rt-bar {
    display: flex;
    align-items: center;
  }
  .bridge-rt-toggle,
  .bridge-rt-close {
    cursor: pointer;
    padding: 6px 10px;
    border-radius: 8px;
  }
  .bridge-rt-toggle {
    flex: 1;
  }
  .bridge-rt-close {
    font-size: 14px;
    line-height: 1;
    color: #b0b8c1;
  }
  .bridge-rt-toggle:focus-visible,
  .bridge-rt-close:focus-visible,
  .bridge-rt-link:focus-visible {
    outline: 2px solid #58a6ff;
    outline-offset: 1px;
  }
  .bridge-rt-dot {
    color: #f85149;
  }
  .bridge-rt-panel {
    display: block;
    padding: 4px 10px 10px;
    border-top: 1px solid #3d444d;
  }
  .bridge-rt-row {
    display: flex;
    gap: 8px;
    padding-top: 6px;
  }
  .bridge-rt-label {
    flex: 0 0 72px;
    color: #9198a1;
  }
  .bridge-rt-value {
    flex: 1;
  }
  .bridge-rt-code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    overflow-wrap: anywhere;
  }
  .bridge-rt-link {
    display: inline-block;
    margin-top: 8px;
    color: #58a6ff;
    text-decoration: underline;
    cursor: pointer;
  }
  .bridge-rt-note {
    display: block;
    margin-top: 8px;
    color: #9198a1;
    font-size: 11px;
  }
</style>
