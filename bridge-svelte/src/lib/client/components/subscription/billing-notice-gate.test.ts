// Billing 2.0 soft gate — <BridgeBillingNotice mode="hard"> rendering decision.
//
// HARNESS NOTE: bridge-svelte's vitest config (vitest.config.ts) runs in a
// `node` environment with no Svelte compiler plugin and no DOM (jsdom /
// happy-dom / @testing-library/svelte are NOT installed anywhere in the
// workspace). The established UI-rendering pattern for this plugin is Playwright
// E2E (e2e/playwright/tests/subscription/*.spec.ts), which drives a live demo
// app against a running bridge-api — incompatible with the "mocked, no
// bridge-api" requirement for this gate logic.
//
// So this test exercises the EXACT rendering decision the component derives,
// using the same auth-core primitives the component imports, against a real
// BridgeSubscription store flipped with mocked snapshots / markLocked():
//
//   visible      = snapshot.state !== null && noticeState !== 'active'
//   asLockscreen = mode === 'hard' && severity === 'locked'
//   inline       = visible && !asLockscreen           (.bridge-billing-notice)
//   lockscreen   = visible && asLockscreen            (.bridge-billing-lockscreen)
//
// The component source these mirror is BridgeBillingNotice.svelte (the
// `{#if visible}{#if asLockscreen}` template block).

import { describe, it, expect, beforeEach } from 'vitest';
import {
  BridgeSubscription,
  deriveNoticeState,
  deriveSeverity,
  type BillingSubscriptionState,
  type BillingSubscriptionSnapshot,
} from '@nebulr-group/bridge-auth-core';

type Mode = 'soft' | 'hard';

/**
 * Pure replica of the component's render decision. Given a snapshot + mode,
 * returns which root element (if any) BridgeBillingNotice renders.
 */
function renderTarget(
  snapshot: BillingSubscriptionSnapshot,
  mode: Mode,
): 'lockscreen' | 'notice' | 'none' {
  const noticeState = deriveNoticeState(snapshot.state);
  const severity = deriveSeverity(noticeState);
  const visible = snapshot.state !== null && noticeState !== 'active';
  const asLockscreen = mode === 'hard' && severity === 'locked';
  if (!visible) return 'none';
  return asLockscreen ? 'lockscreen' : 'notice';
}

const LOCKED_PAYLOAD = {
  reason: 'billing_locked' as const,
  billing: { status: 'past_due' as const, gateEngaged: true, recoveryUrl: '/billing' },
};

const ACTIVE_STATE: BillingSubscriptionState = {
  plan: { slug: 'pro', name: 'Pro' },
  status: 'active',
};

describe('BridgeBillingNotice gate decision (mode=hard vs soft)', () => {
  let sub: BridgeSubscription;

  beforeEach(() => {
    sub = new BridgeSubscription();
  });

  describe('when the subscription store is locked (gateEngaged, severity locked)', () => {
    beforeEach(() => {
      sub.markLocked(LOCKED_PAYLOAD);
      // Sanity: the store really is in the locked/severity=locked shape.
      const snap = sub.snapshot();
      expect(snap.state?.gateEngaged).toBe(true);
      expect(deriveSeverity(deriveNoticeState(snap.state))).toBe('locked');
    });

    it('mode="hard" renders the full-screen lockscreen (.bridge-billing-lockscreen)', () => {
      expect(renderTarget(sub.snapshot(), 'hard')).toBe('lockscreen');
    });

    it('mode="hard" does NOT render the inline .bridge-billing-notice', () => {
      expect(renderTarget(sub.snapshot(), 'hard')).not.toBe('notice');
    });

    it('mode="soft" (default) renders the inline banner even when locked', () => {
      expect(renderTarget(sub.snapshot(), 'soft')).toBe('notice');
    });

    it('mode="soft" does NOT render the lockscreen when locked', () => {
      expect(renderTarget(sub.snapshot(), 'soft')).not.toBe('lockscreen');
    });
  });

  describe('when not locked', () => {
    it('renders neither lockscreen nor inline notice on a null/unmounted state', () => {
      // Fresh store: state === null → not visible.
      expect(renderTarget(sub.snapshot(), 'hard')).toBe('none');
      expect(renderTarget(sub.snapshot(), 'soft')).toBe('none');
    });

    it('renders neither for an active subscription (noticeState === active)', () => {
      sub.hydrate(ACTIVE_STATE);
      expect(renderTarget(sub.snapshot(), 'hard')).toBe('none');
      expect(renderTarget(sub.snapshot(), 'soft')).toBe('none');
    });
  });
});
