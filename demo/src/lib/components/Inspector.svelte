<script lang="ts">
  import { realtimeStatus } from '@bridge-svelte/lib/core/realtime-status.js';
  import { inspector } from '$lib/demo/inspector.svelte.js';

  // Color-code events by their dotted namespace so the rail is scannable:
  // bridge.events.* = primary, flag.* = live, sdk.* = warn, everything else neutral.
  function tone(kind: string): string {
    if (kind.startsWith('flag')) return 'live';
    if (kind.startsWith('sdk')) return 'warn';
    if (kind.startsWith('bridge.events')) return 'primary';
    return 'muted';
  }

  function preview(detail: unknown): string {
    try {
      const s = JSON.stringify(detail);
      return s.length > 160 ? s.slice(0, 160) + '…' : s;
    } catch {
      return String(detail);
    }
  }

  let expanded = $state<number | null>(null);
</script>

<aside class="ins" class:open={inspector.open} aria-label="Under the hood inspector">
  <header class="ins-head">
    <div class="ins-title">
      <span class="ins-dot" data-state={$realtimeStatus}></span>
      Under the hood
    </div>
    <div class="ins-actions">
      <span class="ins-conn">{$realtimeStatus}</span>
      <button class="ins-btn" onclick={() => inspector.clear()} title="Clear events">clear</button>
      <button class="ins-btn" onclick={() => (inspector.open = false)} title="Collapse">✕</button>
    </div>
  </header>

  <div class="ins-section-label">Live events · {inspector.events.length}</div>

  <div class="ins-log">
    {#if inspector.events.length === 0}
      <div class="ins-empty">
        No events yet. Toggle a flag in admin, sign in, or change a plan — every
        push the SDK receives shows up here.
      </div>
    {:else}
      {#each inspector.events as ev (ev.id)}
        <button
          class="ins-event tone-{tone(ev.kind)}"
          onclick={() => (expanded = expanded === ev.id ? null : ev.id)}
        >
          <span class="ins-ts">{ev.ts}</span>
          <span class="ins-kind">{ev.kind}</span>
          {#if expanded === ev.id}
            <pre class="ins-detail">{JSON.stringify(ev.detail, null, 2)}</pre>
          {:else}
            <span class="ins-preview">{preview(ev.detail)}</span>
          {/if}
        </button>
      {/each}
    {/if}
  </div>
</aside>

<style>
  .ins {
    display: flex;
    flex-direction: column;
    width: 340px;
    flex: none;
    border-left: 1px solid var(--border);
    background: var(--surface);
    height: 100%;
    overflow: hidden;
  }
  .ins-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 48px;
    padding: 0 14px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
  }
  .ins-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text);
  }
  .ins-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-faint);
  }
  .ins-dot[data-state='open'] {
    background: var(--live);
    box-shadow: 0 0 0 3px var(--live-soft);
  }
  .ins-dot[data-state='connecting'] {
    background: var(--warn);
  }
  .ins-dot[data-state='closed'] {
    background: var(--danger);
  }
  .ins-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .ins-conn {
    font: 600 10px ui-monospace, monospace;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-faint);
    margin-right: 2px;
  }
  .ins-btn {
    background: none;
    border: 1px solid var(--border-2);
    border-radius: 6px;
    color: var(--text-muted);
    font: 600 10px ui-monospace, monospace;
    padding: 3px 7px;
    cursor: pointer;
  }
  .ins-btn:hover {
    color: var(--text);
    border-color: var(--primary);
  }
  .ins-section-label {
    font: 600 9.5px ui-monospace, monospace;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-faint);
    padding: 12px 14px 6px;
  }
  .ins-log {
    flex: 1;
    overflow-y: auto;
    padding: 0 8px 12px;
  }
  .ins-empty {
    padding: 16px 12px;
    font-size: 11.5px;
    line-height: 1.6;
    color: var(--text-faint);
  }
  .ins-event {
    display: block;
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    margin-bottom: 4px;
    border: 1px solid var(--border);
    border-left: 2px solid var(--text-faint);
    border-radius: 7px;
    background: var(--surface-2);
    cursor: pointer;
    font-family: ui-monospace, monospace;
  }
  .ins-event:hover {
    background: var(--surface-3);
  }
  .ins-event.tone-live {
    border-left-color: var(--live);
  }
  .ins-event.tone-primary {
    border-left-color: var(--primary);
  }
  .ins-event.tone-warn {
    border-left-color: var(--warn);
  }
  .ins-ts {
    color: var(--text-faint);
    font-size: 10px;
    margin-right: 6px;
  }
  .ins-kind {
    color: var(--text);
    font-size: 11px;
    font-weight: 600;
  }
  .ins-preview {
    display: block;
    margin-top: 4px;
    color: var(--text-muted);
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ins-detail {
    margin: 6px 0 0;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--text-muted);
    font-size: 10px;
  }

  /* On narrow screens the rail would crush the content column — float it over
     the page as a right-hand drawer instead. */
  @media (max-width: 900px) {
    .ins {
      position: fixed;
      top: 56px;
      right: 0;
      bottom: 0;
      width: min(340px, 88vw);
      z-index: 45;
      box-shadow: var(--shadow-2);
    }
  }
</style>
