<script lang="ts">
  import Navbar from '$lib/components/Navbar.svelte';
  import BridgeBootstrap from '@bridge-svelte/lib/client/BridgeBootstrap.svelte';
  import { realtimeStatus } from '@bridge-svelte/lib/core/realtime-status.js';
  import { onBridgeRealtimeUserState, type StartBridgeRuntimeOptions } from '@bridge-svelte/lib/core/bridge-runtime.js';
  // Keep `/flags` on the static dependency graph so the auto-attach inside
  // <BridgeBootstrap /> resolves it (a barrel import is enough; no
  // createBridgeFlags call here — that's the whole point of the hoist).
  import '@bridge-svelte/lib/flags';
  import { getBridgeAuth } from '@bridge-svelte/lib/core/bridge-instance';
  // Phase 4 (TBP-325) — unified bridge surface. Exposed on `window` in DEBUG
  // mode so Playwright (TBP-326) can assert snapshot delivery end-to-end.
  import { bridge } from '@bridge-svelte/lib/core/bridge.js';
  import { stylesToggle } from '$lib/styles-toggle.svelte.js';
  import bridgeStylesContent from '@bridge-svelte/lib/styles.css?inline';
  import '../app.css';

  const DEBUG = import.meta.env.VITE_BRIDGE_DEBUG === 'true';

  let { children } = $props();

  // Debug overlay state — last N realtime events received by the client.
  type RtEvent = { id: number; ts: string; kind: string; detail: unknown };
  let rtEvents = $state<RtEvent[]>([]);
  let debugOpen = $state(false);
  let _eventId = 0;

  function recordEvent(data: unknown) {
    const ev = data as any;
    rtEvents = [
      { id: ++_eventId, ts: new Date().toISOString().slice(11, 23), kind: ev.kind, detail: data },
      ...rtEvents,
    ].slice(0, 20);
  }

  // DEBUG-only: wrap the native WebSocket so the realtime debug overlay can
  // log every incoming Bridge push (Playwright + manual QA harness). This is
  // the only thing left a consumer might inject — and it goes through the
  // <BridgeBootstrap runtime={...} /> prop, not a separate flag init call.
  // The realtime client types `websocketFactory` as returning a minimal
  // `WebSocketLike`; the DOM `WebSocket` is structurally compatible but
  // its `onmessage` signature is stricter, so cast the whole overrides
  // object once at the boundary.
  const runtimeOverrides = DEBUG
    ? ({
        realtime: {
          // Forward `protocols` to the native WebSocket: the AppSync Events
          // transport relies on subprotocol negotiation (`aws-appsync-event-ws`
          // + the `header-…` auth token) — dropping it here would leave AppSync
          // happy at TCP/TLS but unable to process any frames, producing a
          // silent reconnect loop. Centrifugo passes nothing so this is a no-op
          // for that transport. Wire-formats:
          //   Centrifugo → protocols = undefined
          //   AppSync    → protocols = ['aws-appsync-event-ws', 'header-<b64>']
          websocketFactory: (url: string, protocols?: string | string[]) => {
            const ws = new WebSocket(url, protocols);
            ws.addEventListener('message', (e: MessageEvent) => {
              try {
                const msg = JSON.parse(e.data as string);
                // Centrifugo wraps publishes in push.pub.data; AppSync delivers
                // payloads as a JSON-string inside { type:'data', event:'…' }.
                // Unwrap both shapes so the debug overlay shows real events.
                let data: any = msg?.push?.pub?.data ?? msg?.pub?.data ?? msg;
                if (msg?.type === 'data' && typeof msg.event === 'string') {
                  try { data = JSON.parse(msg.event); } catch { /* ignore */ }
                }
                if (data?.kind) {
                  console.debug('[Bridge RT] ←', data.kind, data);
                  recordEvent(data);
                }
              } catch { /* ignore */ }
            });
            ws.addEventListener('open', () => console.debug('[Bridge RT] WS connected', url));
            ws.addEventListener('close', (e: CloseEvent) => console.debug('[Bridge RT] WS closed', e.code, e.reason));
            return ws;
          },
        },
      } as unknown as StartBridgeRuntimeOptions)
    : undefined;

  // Surface user.state_changed signals in the debug panel regardless of
  // whether the raw WebSocket message is visible (per-user channel may
  // arrive on a reconnected socket after setUserId). Subscriber registers
  // against the SHARED runtime — no need for a flag-specific callback.
  $effect(() => {
    const unsub = onBridgeRealtimeUserState(({ reason }) => {
      recordEvent({ kind: 'sdk.user_state', reason, action: 'token_refresh_triggered' });
    });
    return unsub;
  });

  // FF 2.0 release-validation test hook (TBP-241 Phase 3 #23) — DEBUG only.
  // Playwright needs a way to force a token refresh mid-session to assert that
  // (a) the per-user realtime channel stays subscribed across the refresh and
  // (b) no flag flicker happens. Exposing this only in DEBUG keeps the demo's
  // production-facing surface unchanged.
  $effect(() => {
    if (!DEBUG) return;
    (window as any).__ff2RefreshTokens = async () => {
      try {
        await getBridgeAuth().refreshTokens();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    };
  });

  // Phase 4 (TBP-325/326) — expose the unified bridge on window so Playwright
  // can assert snapshot delivery (`bridge.tenant.id`, `bridge.user.email`,
  // `bridge.app.plans.load()`, etc.) without needing a custom test harness.
  // DEBUG-only — production-facing demo keeps the window surface unchanged.
  $effect(() => {
    if (!DEBUG) return;
    (window as any).bridge = bridge;
  });

  // Phase 5 (TBP-333) — demo bridge.attributes + bridge.events.
  // The bound `app.cohort` attribute flows through the flag eval pipeline so
  // rule-based flags can target it; the event handler logs every channel
  // message to the existing debug overlay (recordEvent).
  $effect(() => {
    // Static attribute — any value type.
    bridge.attributes.set('app.cohort', 'demo-default');

    // Live-bound attribute — reads from a function reference so reactivity
    // flows through. (Demo: pretends to read viewport size on every eval.)
    bridge.attributes.bind('app.viewport', () =>
      typeof window === 'undefined' || window.innerWidth >= 768 ? 'desktop' : 'mobile',
    );

    const unsub = bridge.events.handle({
      'session.snapshot': (m) => recordEvent({ kind: 'bridge.events.session.snapshot', data: m.data }),
      '*': (m) => recordEvent({ kind: `bridge.events.${m.kind}`, msg: m }),
    });
    return () => unsub();
  });

  $effect(() => {
    const el = document.getElementById('bridge-demo-styles');
    if (stylesToggle.enabled) {
      if (!el) {
        const style = document.createElement('style');
        style.id = 'bridge-demo-styles';
        style.textContent = bridgeStylesContent;
        document.head.appendChild(style);
      }
    } else {
      el?.remove();
    }
  });
</script>

<BridgeBootstrap runtime={runtimeOverrides} />
<Navbar />
<main>
  {@render children()}
</main>

{#if DEBUG}
  <!--
    Realtime connection status pill — always visible in DEBUG so Playwright
    (e.g. FF 2.0 release-validation #27) can assert the store transitions
    (e.g. 'open' → 'closed') without opening the debug panel.
  -->
  <span class="rt-status-pill" data-testid="rt-status">{$realtimeStatus}</span>

  <!-- Realtime debug overlay — toggle with the RT button bottom-right -->
  <button
    class="rt-fab"
    onclick={() => (debugOpen = !debugOpen)}
    title="Realtime debug panel"
  >
    RT {rtEvents.length > 0 ? `·${rtEvents.length}` : ''}
  </button>

  {#if debugOpen}
    <div class="rt-panel">
      <div class="rt-panel-head">
        <span>Bridge RT — last {rtEvents.length} events</span>
        <button onclick={() => { rtEvents = []; }}>clear</button>
        <button onclick={() => (debugOpen = false)}>✕</button>
      </div>
      {#if rtEvents.length === 0}
        <div class="rt-empty">No events yet. Toggle a flag in admin.</div>
      {:else}
        {#each rtEvents as ev (ev.id)}
          <div class="rt-event">
            <span class="rt-ts">{ev.ts}</span>
            <span class="rt-kind">{ev.kind}</span>
            <pre class="rt-detail">{JSON.stringify(ev.detail, null, 2)}</pre>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
{/if}

<style>
  .rt-status-pill {
    position: fixed;
    bottom: 16px;
    right: 96px;
    z-index: 9999;
    padding: 6px 12px;
    border-radius: 20px;
    background: #0f172a;
    color: #94a3b8;
    border: 1px solid #334155;
    font-size: 11px;
    font-family: ui-monospace, monospace;
    font-weight: 600;
    letter-spacing: 0.05em;
  }
  .rt-fab {
    position: fixed;
    bottom: 16px;
    right: 16px;
    z-index: 9999;
    padding: 6px 12px;
    border-radius: 20px;
    background: #1a1a2e;
    color: #7dd3fc;
    border: 1px solid #334155;
    font-size: 11px;
    font-family: ui-monospace, monospace;
    font-weight: 600;
    cursor: pointer;
    letter-spacing: 0.05em;
  }
  .rt-fab:hover { background: #16213e; }

  .rt-panel {
    position: fixed;
    bottom: 56px;
    right: 16px;
    z-index: 9998;
    width: 420px;
    max-height: 480px;
    overflow-y: auto;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 10px;
    color: #e2e8f0;
    font-family: ui-monospace, monospace;
    font-size: 11px;
  }
  .rt-panel-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid #334155;
    background: #1e293b;
    border-radius: 10px 10px 0 0;
    font-weight: 600;
  }
  .rt-panel-head span { flex: 1; }
  .rt-panel-head button {
    background: none;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 10px;
    padding: 2px 6px;
  }
  .rt-empty {
    padding: 20px;
    color: #64748b;
    text-align: center;
  }
  .rt-event {
    padding: 8px 12px;
    border-bottom: 1px solid #1e293b;
  }
  .rt-ts { color: #64748b; margin-right: 8px; }
  .rt-kind {
    color: #34d399;
    font-weight: 600;
    margin-right: 8px;
  }
  .rt-detail {
    margin: 4px 0 0;
    white-space: pre-wrap;
    word-break: break-all;
    color: #94a3b8;
    font-size: 10px;
  }
</style>
