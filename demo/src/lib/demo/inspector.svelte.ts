/*
 * Inspector event log — the demo's "Under the Hood" rail.
 *
 * The realtime plumbing stays in +layout.svelte (it owns the WebSocket factory
 * + bridge.events.handle wiring); it just funnels every event here via
 * `inspector.record(...)`. Keeping the log in a shared rune store lets the
 * docked Inspector component read it without prop-drilling through AppShell.
 */

export interface RtEvent {
  id: number;
  ts: string;
  kind: string;
  detail: unknown;
}

class InspectorStore {
  events = $state<RtEvent[]>([]);
  open = $state<boolean>(false);
  private _id = 0;

  record(data: unknown) {
    const ev = data as { kind?: string };
    this.events = [
      {
        id: ++this._id,
        ts: new Date().toISOString().slice(11, 23),
        kind: ev?.kind ?? 'event',
        detail: data,
      },
      ...this.events,
    ].slice(0, 50);
  }

  clear() {
    this.events = [];
  }

  toggle() {
    this.open = !this.open;
  }
}

export const inspector = new InspectorStore();
