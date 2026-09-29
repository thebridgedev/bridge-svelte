// TBP-762 — <BridgeSubscriptionStatus>, rendered with svelte/server.
//
// The badge never shows "No subscription" or an error before its own read has
// answered, and on the checkout success page (`fresh`) it does not show the
// plan the store held before the checkout: it says "Loading…" until a read
// made after it mounted has answered.

import { describe, expect, it, vi } from 'vitest';

const { snap } = vi.hoisted(() => ({
  snap: { current: { state: null, loading: false, error: null } as Record<string, unknown> },
}));

vi.mock('@nebulr-group/bridge-auth-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nebulr-group/bridge-auth-core')>();
  return {
    ...actual,
    useBridge: () => ({ subscription: { snapshot: () => snap.current, subscribe: () => () => {} } }),
  };
});
vi.mock('../../../core/billing-store.js', () => ({
  ensureBillingState: async () => {},
  refreshBillingState: async () => {},
}));

import { render as ssr } from 'svelte/server';
import BridgeSubscriptionStatus from './BridgeSubscriptionStatus.svelte';

function render(props: Record<string, unknown> = {}): string {
  return ssr(BridgeSubscriptionStatus as never, { props } as never).body;
}

const FREE = { plan: { slug: 'free', name: 'Free' }, status: 'active' };

describe('<BridgeSubscriptionStatus> — TBP-762', () => {
  it('before any read: "Loading…", never "No subscription" or "Subscription unavailable"', () => {
    snap.current = { state: null, loading: false, error: null };
    const html = render();
    expect(html).toContain('Loading…');
    expect(html).not.toContain('No subscription');
    expect(html).not.toContain('Subscription unavailable');
  });

  it('with a plan in the store: the plan', () => {
    snap.current = { state: FREE, loading: false, error: null };
    expect(render()).toContain('Free');
  });

  it('fresh (the checkout success page): "Loading…" even though the store holds the old plan', () => {
    snap.current = { state: FREE, loading: false, error: null };
    const html = render({ fresh: true });
    expect(html).toContain('Loading…');
    expect(html).not.toContain('>Free<');
  });

  it('a plan in the store wins over an error from a later re-read', () => {
    snap.current = { state: FREE, loading: false, error: 'TOKEN_VERSION_STALE' };
    const html = render();
    expect(html).toContain('Free');
    expect(html).not.toContain('Subscription unavailable');
  });
});
