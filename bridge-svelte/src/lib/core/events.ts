/**
 * Phase 5 (TBP-289/331) — `bridge.events.handle({...})` multiplex dispatcher.
 *
 * One API for every channel-event kind. Discriminated union by `kind`:
 *
 *   const unsub = bridge.events.handle({
 *     'flag.updated':         (m) => console.log('flag', m.flag.key),
 *     'subscription.canceled': (m) => toast('Cancelled', m.effectiveAt),
 *     'quota.updated':         (m) => updateMeter(m.metric, m.remaining),
 *     'session.snapshot':      (m) => analytics.track('hydrate', m.data),
 *     '*':                     (m) => debug('fallback', m.kind),
 *   });
 *   // … later
 *   unsub();
 *
 * Multi-handler — multiple consumers can register handlers for the same
 * kind; all fire on every matching event. Handler errors are isolated:
 * one throwing handler doesn't block the rest, doesn't break the dispatch
 * loop, doesn't propagate out of `_dispatch`.
 *
 * The fallback `'*'` handler fires when no specific handler is registered
 * for that kind (NOT for every event — that would double-fire when both
 * a specific and a `*` handler are registered).
 */
import type {
  FlagUpdateMessage,
  FlagRemovedMessage,
  UserStateMessage,
  SubscriptionPlanChangedMessage,
  BillingLifecycleMessage,
  QuotaUpdatedMessage,
  EntitlementsChangedMessage,
  SessionSnapshotMessage,
  RealtimeMessage,
} from '@nebulr-group/bridge-auth-core';

/**
 * Discriminated handler table. Every kind in `RealtimeMessage`'s union is
 * a key; `'*'` is the catch-all when no specific handler is registered.
 * Each handler is optional; consumers register the subset they care about.
 */
export interface BridgeEventHandlers {
  'flag.updated'?: (msg: FlagUpdateMessage) => void;
  'flag.removed'?: (msg: FlagRemovedMessage) => void;
  'user.state_changed'?: (msg: UserStateMessage) => void;
  'subscription.plan_changed'?: (msg: SubscriptionPlanChangedMessage) => void;
  'payment.failed'?: (msg: BillingLifecycleMessage) => void;
  'payment.succeeded'?: (msg: BillingLifecycleMessage) => void;
  'subscription.created'?: (msg: BillingLifecycleMessage) => void;
  'subscription.updated'?: (msg: BillingLifecycleMessage) => void;
  'subscription.canceled'?: (msg: BillingLifecycleMessage) => void;
  'subscription.reactivated'?: (msg: BillingLifecycleMessage) => void;
  'subscription.trial_started'?: (msg: BillingLifecycleMessage) => void;
  'subscription.trial_ending_soon'?: (msg: BillingLifecycleMessage) => void;
  'subscription.trial_converted'?: (msg: BillingLifecycleMessage) => void;
  'subscription.trial_expired'?: (msg: BillingLifecycleMessage) => void;
  'dunning.entered'?: (msg: BillingLifecycleMessage) => void;
  'dunning.retry_scheduled'?: (msg: BillingLifecycleMessage) => void;
  'dunning.recovered'?: (msg: BillingLifecycleMessage) => void;
  'dunning.exhausted'?: (msg: BillingLifecycleMessage) => void;
  'quota.updated'?: (msg: QuotaUpdatedMessage) => void;
  'entitlements.changed'?: (msg: EntitlementsChangedMessage) => void;
  'session.snapshot'?: (msg: SessionSnapshotMessage) => void;
  /** Catch-all when no specific handler is registered for the kind. */
  '*'?: (msg: RealtimeMessage) => void;
}

type AnyHandler = (msg: RealtimeMessage) => void;

export class BridgeEventsDispatcher {
  // Per-kind handler set so multiple subscribers can register for the same kind.
  private readonly _byKind = new Map<string, Set<AnyHandler>>();
  // Fallbacks fire only when no specific handler is registered for the kind.
  private readonly _fallbacks = new Set<AnyHandler>();

  /** Register a handler table. Returns one `unsubscribe` for all kinds passed. */
  handle(handlers: BridgeEventHandlers): () => void {
    const added: Array<{ kind: string; fn: AnyHandler }> = [];
    for (const [kind, fn] of Object.entries(handlers)) {
      if (typeof fn !== 'function') continue;
      const h = fn as AnyHandler;
      if (kind === '*') {
        this._fallbacks.add(h);
        added.push({ kind: '*', fn: h });
        continue;
      }
      let set = this._byKind.get(kind);
      if (!set) {
        set = new Set();
        this._byKind.set(kind, set);
      }
      set.add(h);
      added.push({ kind, fn: h });
    }
    return () => {
      for (const { kind, fn } of added) {
        if (kind === '*') {
          this._fallbacks.delete(fn);
        } else {
          this._byKind.get(kind)?.delete(fn);
        }
      }
    };
  }

  /**
   * Internal — called by `createBridgeFlags` from every RealtimeClient hook.
   * Routes by `msg.kind` to registered handlers; falls back to `'*'` handlers
   * only when no specific handler exists for that kind.
   *
   * Never throws — handler exceptions are caught per-call so a single broken
   * subscriber can't poison the dispatch.
   */
  _dispatch(msg: RealtimeMessage): void {
    const set = this._byKind.get(msg.kind);
    const targets = set && set.size > 0 ? set : this._fallbacks;
    for (const fn of targets) {
      try {
        fn(msg);
      } catch {
        // Ignore — one broken subscriber must not block the others.
      }
    }
  }

  /** Test-only: drop every registered handler. */
  _resetForTests(): void {
    this._byKind.clear();
    this._fallbacks.clear();
  }
}

/** The singleton dispatcher exposed as `bridge.events` on the unified surface. */
export const bridgeEvents = new BridgeEventsDispatcher();
