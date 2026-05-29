// US-13 — integration test for the three load-bearing scenarios (TBP-301).
//
// Phase 1 baseline: Vitest integration (not Playwright). The slot-4 stack is
// running, but full Playwright fixtures for live plan-downgrade /
// entitlement-push / role-flip + token-refresh need backend admin actions
// (mutating subscription state, firing realtime pushes, rotating JWT claims)
// that aren't covered by the existing demo-app fixtures yet. We file those
// real Playwright fixtures as follow-up work and prove the load-bearing
// SDK-side promise here:
//
//   "bridge:billing.* flag rules flip live when backend state changes — no
//    page refresh."
//
// We wire real BridgeFlags + real AttributeProviderRegistry + the real
// BillingAttributeProvider + AuthAttributeProvider against in-memory stub
// stores. Mutating the stubs simulates the realtime push; calling
// `bridge.flag()` immediately reflects the new value. This proves the
// auto-registration + sync hot-path collect works end-to-end.
//
// Scenarios:
//   A. Plan downgrade flips a flag (bridge:billing.plan eq "pro").
//   B. Entitlement push flips a flag (bridge:billing.entitlement.ai_completions == true).
//   C. Role change flips a flag (user.role eq "OWNER") via the
//      AuthAttributeProvider's getClaims() callback.

import { describe, it, expect } from 'vitest';
import {
  BridgeFlags,
  BillingAttributeProvider,
  AuthAttributeProvider,
  type AuthJwtClaims,
} from '@nebulr-group/bridge-auth-core';
import type {
  BillingSubscriptionSnapshot,
  BillingSubscriptionState,
} from '@nebulr-group/bridge-auth-core';

// ── In-memory store stubs ──────────────────────────────────────────────────
// Match the same surface BillingAttributeProvider expects from `bindStores`:
//   subscription.snapshot() : { state, loading, error }
//   quotas.getAll() : Map<metric, snap>
//   entitlements.all() / entitlements.isHydrated()

function makeSubscriptionStub() {
  let _state: BillingSubscriptionState | null = null;
  return {
    snapshot(): BillingSubscriptionSnapshot {
      return { state: _state, loading: false, error: null };
    },
    setPlan(slug: string, name = slug) {
      _state = {
        plan: { slug, name },
        status: 'active',
      };
    },
    clear() {
      _state = null;
    },
  };
}

function makeQuotaStub() {
  return {
    getAll() {
      return new Map();
    },
    configure: () => {},
  };
}

function makeEntitlementsStub() {
  let _all: Record<string, boolean> = {};
  let _hydrated = false;
  return {
    all() {
      return { ..._all };
    },
    isHydrated() {
      return _hydrated;
    },
    set(name: string, value: boolean) {
      _all = { ..._all, [name]: value };
      _hydrated = true;
    },
    replace(snap: Record<string, boolean>) {
      _all = { ...snap };
      _hydrated = true;
    },
  };
}

// Cached flag with a single-branch rule used across all three scenarios.
// Rule fires when `attribute <op> value` matches the eval context;
// otherwiseValue covers the no-match case.
function makeRuleFlag(attribute: string, value: string | boolean): Parameters<BridgeFlags['hydrate']>[0][number] {
  return {
    key: `flag.${attribute}.${String(value)}`,
    state: 'on-with-rule',
    valueType: 'boolean',
    offValue: false,
    onValue: true,
    rule: {
      branches: [
        {
          conditions: [
            {
              attribute,
              operator: 'eq',
              values: [value],
            },
          ],
          returnValue: true,
        },
      ],
      otherwiseValue: false,
      rolloutPct: 100,
    },
  };
}

describe('US-13 — bridge:billing.* flag rules flip live with backend state', () => {
  it('Scenario A — plan downgrade flips a flag (PRO → FREE)', () => {
    const bridge = new BridgeFlags();
    const subscription = makeSubscriptionStub();
    const provider = new BillingAttributeProvider();
    provider.bindStores({
      subscription: subscription as never,
      quotas: makeQuotaStub() as never,
      entitlements: makeEntitlementsStub() as never,
    });
    bridge.registerAttributeProvider(provider);

    const flag = makeRuleFlag('bridge:billing.plan', 'pro');
    bridge.hydrate([flag]);

    // Initial state: PRO → flag passes.
    subscription.setPlan('pro');
    expect(bridge.flag(flag.key, false).passed).toBe(true);

    // Backend pushes a plan downgrade (subscription store mutates in-place).
    subscription.setPlan('free');
    // No re-hydrate, no setContext, no page refresh. The next eval reads
    // through collectSync() → BillingAttributeProvider.provide() → live store
    // → new plan slug → rule no longer matches.
    expect(bridge.flag(flag.key, false).passed).toBe(false);
  });

  it('Scenario B — entitlement push flips a flag (ai_completions on → off)', () => {
    const bridge = new BridgeFlags();
    const entitlements = makeEntitlementsStub();
    const provider = new BillingAttributeProvider();
    provider.bindStores({
      subscription: makeSubscriptionStub() as never,
      quotas: makeQuotaStub() as never,
      entitlements: entitlements as never,
    });
    bridge.registerAttributeProvider(provider);

    const flag = makeRuleFlag('bridge:billing.entitlement.ai_completions', true);
    bridge.hydrate([flag]);

    // Initial: entitlement granted → flag passes.
    entitlements.set('ai_completions', true);
    expect(bridge.flag(flag.key, false).passed).toBe(true);

    // Server pushes entitlements.changed removing the entitlement.
    // (RealtimeClient.setOnEntitlementsChanged → store.applyEntitlementsChanged.)
    entitlements.replace({});
    expect(bridge.flag(flag.key, false).passed).toBe(false);
  });

  it('Scenario C — role change flips a flag (user.role eq OWNER → ADMIN) via token refresh', () => {
    const bridge = new BridgeFlags();
    let currentClaims: AuthJwtClaims | undefined;
    const authProvider = new AuthAttributeProvider({
      getClaims: () => currentClaims,
    });
    bridge.registerAttributeProvider(authProvider);

    const flag = makeRuleFlag('user.role', 'OWNER');
    bridge.hydrate([flag]);

    // Initial: claims show OWNER → flag passes.
    currentClaims = { sub: 'user-42', role: 'OWNER', tid: 'tenant-7' };
    bridge.setContext({ identity: 'user-42', attributes: {} });
    expect(bridge.flag(flag.key, false).passed).toBe(true);

    // Server signals role change → bridge-api refreshes the JWT → bootstrap's
    // tokenStore.subscribe updates _currentClaims (modeled here by reassigning
    // `currentClaims`). No re-hydrate of the flag cache; no manual setContext
    // of the role attribute (it flows via the provider now).
    currentClaims = { sub: 'user-42', role: 'ADMIN', tid: 'tenant-7' };
    expect(bridge.flag(flag.key, false).passed).toBe(false);
  });
});
