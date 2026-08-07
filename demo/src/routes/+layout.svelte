<script lang="ts">
  import AppShell from '$lib/components/AppShell.svelte';
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
  import bridgeStylesContent from '@bridge-svelte/lib/styles.css?inline';
  import { stylesToggle } from '$lib/styles-toggle.svelte.js';
  import { inspector } from '$lib/demo/inspector.svelte.js';
  import { demoState } from '$lib/demo/demo-state.svelte.js';
  import '$lib/design/tokens.css';
  import '../app.css';

  const DEBUG = import.meta.env.VITE_BRIDGE_DEBUG === 'true';

  let { children } = $props();

  // Every realtime push the SDK receives is funnelled into the Inspector rail
  // (the docked "Under the hood" log — see lib/components/Inspector.svelte).
  function recordEvent(data: unknown) {
    inspector.record(data);
  }

  // DEBUG-only: wrap the native WebSocket so the inspector can log every
  // incoming Bridge push (Playwright + manual QA harness). This is the only
  // thing left a consumer might inject — and it goes through the
  // <BridgeBootstrap runtime={...} /> prop, not a separate flag init call.
  const runtimeOverrides = DEBUG
    ? ({
        realtime: {
          // Forward `protocols` to the native WebSocket: the AppSync Events
          // transport relies on subprotocol negotiation (`aws-appsync-event-ws`
          // + the `header-…` auth token) — dropping it here would leave AppSync
          // happy at TCP/TLS but unable to process any frames, producing a
          // silent reconnect loop. Centrifugo passes nothing so this is a no-op.
          websocketFactory: (url: string, protocols?: string | string[]) => {
            const ws = new WebSocket(url, protocols);
            ws.addEventListener('message', (e: MessageEvent) => {
              try {
                const msg = JSON.parse(e.data as string);
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

  // Surface user.state_changed signals regardless of whether the raw WebSocket
  // message is visible. Subscriber registers against the SHARED runtime.
  $effect(() => {
    const unsub = onBridgeRealtimeUserState(({ reason }) => {
      recordEvent({ kind: 'sdk.user_state', reason, action: 'token_refresh_triggered' });
    });
    return unsub;
  });

  // FF 2.0 release-validation test hook (TBP-241) — DEBUG only.
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
  // can assert snapshot delivery without a custom test harness. DEBUG-only.
  $effect(() => {
    if (!DEBUG) return;
    (window as any).bridge = bridge;
  });

  // Apply the persisted theme as soon as the shell mounts (SSR is off, so this
  // runs client-side and avoids a flash).
  $effect(() => {
    demoState.applyTheme();
  });

  // Demo bridge.attributes + bridge.events. The bound attributes flow through
  // the flag eval pipeline so rule-based flags can target them; the event
  // handler logs every channel message to the Inspector.
  $effect(() => {
    bridge.attributes.set('app.cohort', 'demo-default');
    bridge.attributes.bind('app.viewport', () =>
      typeof window === 'undefined' || window.innerWidth >= 768 ? 'desktop' : 'mobile',
    );

    const unsub = bridge.events.handle({
      'session.snapshot': (m) => recordEvent({ kind: 'bridge.events.session.snapshot', data: m.data }),
      '*': (m) => recordEvent({ kind: `bridge.events.${m.kind}`, msg: m }),
    });
    return () => unsub();
  });

  // Persona switcher → flag attribute. Writing app.persona on every change lets
  // rule-based flags target the selected persona live (real eval, not cosmetic).
  $effect(() => {
    bridge.attributes.set('app.persona', demoState.personaId);
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

<AppShell>
  {@render children()}
</AppShell>

{#if DEBUG}
  <!--
    Realtime connection status pill — always visible in DEBUG so Playwright
    (FF 2.0 release-validation #27) can assert the store transitions
    ('open' → 'closed') without opening the inspector.
  -->
  <span class="rt-status-pill" data-testid="rt-status">{$realtimeStatus}</span>
{/if}

<style>
  .rt-status-pill {
    position: fixed;
    bottom: 12px;
    right: 12px;
    z-index: 9999;
    padding: 5px 11px;
    border-radius: 20px;
    background: var(--surface-2);
    color: var(--text-muted);
    border: 1px solid var(--border-2);
    font-size: 11px;
    font-family: ui-monospace, monospace;
    font-weight: 600;
    letter-spacing: 0.05em;
  }
</style>
