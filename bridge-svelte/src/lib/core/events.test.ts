// Phase 5 (TBP-331/335) — BridgeEventsDispatcher unit tests.
//
// Verifies:
//   1. handle({...}) registers per-kind handlers + returns a single unsubscribe
//   2. Multi-subscriber: 3 handle() calls for same kind all fire on dispatch
//   3. Catch-all `'*'` fires ONLY when no specific handler is registered
//   4. unsubscribe() removes only the handlers that THAT handle() registered
//   5. Handler errors are isolated (one broken sub doesn't block others)
//   6. Unknown kinds with no specific handler + no fallback are silent

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BridgeEventsDispatcher } from './events.js';

let dispatcher: BridgeEventsDispatcher;
beforeEach(() => {
  dispatcher = new BridgeEventsDispatcher();
});
afterEach(() => {
  dispatcher._resetForTests();
});

const flagUpdatedMsg = (key: string) =>
  ({ kind: 'flag.updated', flag: { key, state: 'on', valueType: 'boolean', offValue: false, onValue: true } } as any);
const quotaMsg = () =>
  ({ kind: 'quota.updated', tenantId: 'ws-1', effectiveAt: 'now', metric: 'ai_calls', used: 1, limit: 10, remaining: 9, warningLevel: null } as any);

describe('BridgeEventsDispatcher.handle (Phase 5, TBP-331)', () => {
  it('registers a handler and dispatches matching kinds', () => {
    const fn = vi.fn();
    dispatcher.handle({ 'flag.updated': fn });
    dispatcher._dispatch(flagUpdatedMsg('a'));
    expect(fn).toHaveBeenCalledOnce();
  });

  it('returns a single unsubscribe for all kinds passed', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsub = dispatcher.handle({ 'flag.updated': a, 'quota.updated': b });
    dispatcher._dispatch(flagUpdatedMsg('x'));
    dispatcher._dispatch(quotaMsg());
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
    unsub();
    dispatcher._dispatch(flagUpdatedMsg('y'));
    dispatcher._dispatch(quotaMsg());
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('multi-subscriber: 3 handle() calls for same kind all fire', () => {
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    dispatcher.handle({ 'flag.updated': a });
    dispatcher.handle({ 'flag.updated': b });
    dispatcher.handle({ 'flag.updated': c });
    dispatcher._dispatch(flagUpdatedMsg('z'));
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
    expect(c).toHaveBeenCalledOnce();
  });

  it('unsubscribe removes ONLY the handlers from that handle() call', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = dispatcher.handle({ 'flag.updated': a });
    dispatcher.handle({ 'flag.updated': b });
    unsubA();
    dispatcher._dispatch(flagUpdatedMsg('w'));
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });
});

describe('Fallback `*` (Phase 5, TBP-331)', () => {
  it("fires `*` when no specific handler exists for the kind", () => {
    const fb = vi.fn();
    dispatcher.handle({ '*': fb });
    dispatcher._dispatch(flagUpdatedMsg('x'));
    expect(fb).toHaveBeenCalledOnce();
  });

  it("does NOT fire `*` when a specific handler IS registered (no double-fire)", () => {
    const specific = vi.fn();
    const fb = vi.fn();
    dispatcher.handle({ 'flag.updated': specific });
    dispatcher.handle({ '*': fb });
    dispatcher._dispatch(flagUpdatedMsg('x'));
    expect(specific).toHaveBeenCalledOnce();
    expect(fb).not.toHaveBeenCalled();
  });

  it('fires `*` for kinds with no specific handler, even when specifics exist for OTHER kinds', () => {
    const flagOnly = vi.fn();
    const fb = vi.fn();
    dispatcher.handle({ 'flag.updated': flagOnly });
    dispatcher.handle({ '*': fb });
    dispatcher._dispatch(quotaMsg());           // no quota handler → fallback
    dispatcher._dispatch(flagUpdatedMsg('a'));  // flag handler exists → no fallback
    expect(flagOnly).toHaveBeenCalledOnce();
    expect(fb).toHaveBeenCalledOnce();
  });
});

describe('Error isolation (Phase 5, TBP-331)', () => {
  it('one throwing handler does not block others', () => {
    const ok = vi.fn();
    dispatcher.handle({ 'flag.updated': () => { throw new Error('boom'); } });
    dispatcher.handle({ 'flag.updated': ok });
    expect(() => dispatcher._dispatch(flagUpdatedMsg('z'))).not.toThrow();
    expect(ok).toHaveBeenCalledOnce();
  });

  it('throwing fallback does not propagate', () => {
    dispatcher.handle({ '*': () => { throw new Error('fb boom'); } });
    expect(() => dispatcher._dispatch(quotaMsg())).not.toThrow();
  });
});

describe('Unknown kinds (Phase 5, TBP-331)', () => {
  it('is silent when no handler and no fallback are registered', () => {
    expect(() => dispatcher._dispatch({ kind: 'something.unknown' } as any)).not.toThrow();
  });

  it('ignores handler-table entries that are not functions', () => {
    const fn = vi.fn();
    // Type-erased entry — runtime guard should skip it.
    dispatcher.handle({ 'flag.updated': fn, 'quota.updated': null as any });
    dispatcher._dispatch(quotaMsg());
    expect(fn).not.toHaveBeenCalled();
  });
});
