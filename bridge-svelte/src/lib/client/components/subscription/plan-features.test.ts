// TBP-755 — a plan lists the features it includes, and the pricing table and
// the upgrade dialog read that same list.
//
// Real components rendered with svelte/server. The plan picker's store and
// config are doubles; nothing else is.

import { describe, expect, it, vi } from 'vitest';

const { plansHolder } = vi.hoisted(() => ({ plansHolder: { current: [] as unknown[] } }));

vi.mock('../../../core/bridge-instance.js', async () => {
  const { readable } = await import('svelte/store');
  return {
    getBridgeAuth: () => ({}),
    loadSubscription: async () => {},
    subscriptionStore: readable<unknown>(null, (set) => {
      set({ status: null, plans: plansHolder.current, loading: false, error: null });
    }),
  };
});
vi.mock('../../stores/config.store.js', () => ({ getConfig: () => ({}) }));
// TBP-762 — a Free pick navigates on with SvelteKit's goto.
vi.mock('$app/navigation', () => ({ goto: async () => {} }));

import { render as ssr } from 'svelte/server';
import PlanSelector from './PlanSelector.svelte';
import BridgeUpgradeDialog from './BridgeUpgradeDialog.svelte';
import { plansIncludingFeature } from '../../upgrade-dialog.js';

function render(component: unknown, props: Record<string, unknown> = {}): string {
  return ssr(component as never, { props } as never).body;
}

const PLANS = [
  {
    key: 'team',
    name: 'Team',
    prices: [{ id: 't', amount: 50, currency: 'usd', recurrenceInterval: 'month' }],
    features: [{ key: 'analytics', name: 'Analytics' }, { key: 'sso', name: 'Single sign-on' }],
  },
  {
    key: 'free',
    name: 'Free',
    prices: [{ id: 'f', amount: 0, currency: 'usd', recurrenceInterval: 'month' }],
    features: [],
  },
  {
    key: 'pro',
    name: 'Pro',
    prices: [{ id: 'p', amount: 20, currency: 'usd', recurrenceInterval: 'month' }],
    features: [{ key: 'analytics', name: 'Analytics' }],
  },
];

/** The HTML of one plan card, found by its plan name. */
function card(html: string, name: string): string {
  const cards = html.split('data-bridge-plan-card').slice(1);
  const found = cards.find((c) => c.includes(`>${name}</h3>`));
  if (!found) throw new Error(`no card for ${name}`);
  return found;
}

describe('<PlanSelector> lists each plan\'s features — TBP-755', () => {
  it('names every feature on a plan that has them, and renders no list for one without', () => {
    plansHolder.current = PLANS;
    const html = render(PlanSelector);

    const team = card(html, 'Team');
    expect(team).toContain('data-bridge-plan-features');
    expect(team).toContain('aria-label="Included in Team"');
    expect(team).toMatch(/<li[^>]*data-feature="analytics"[^>]*>Analytics<\/li>/);
    expect(team).toMatch(/<li[^>]*data-feature="sso"[^>]*>Single sign-on<\/li>/);

    const pro = card(html, 'Pro');
    expect(pro).toMatch(/>Analytics<\/li>/);
    expect(pro).not.toContain('Single sign-on');

    expect(card(html, 'Free')).not.toContain('data-bridge-plan-features');
  });

  it('a plan from an API that predates features renders without a list', () => {
    plansHolder.current = [{ key: 'old', name: 'Old', prices: [{ id: 'o', amount: 5, currency: 'usd', recurrenceInterval: 'month' }] }];
    const html = render(PlanSelector);
    expect(card(html, 'Old')).not.toContain('data-bridge-plan-features');
  });
});

describe('<PlanSelector> with an empty plan list — TBP-762', () => {
  it('offers a retry, never "No plans available" (an empty list is not proof there are none)', () => {
    plansHolder.current = [];
    const html = render(PlanSelector);
    expect(html).not.toContain('No plans available');
    expect(html).toContain('data-bridge-plan-empty');
    expect(html).toContain('Try again');
  });
});

describe('the upgrade dialog names the plans that include a missing feature — TBP-755', () => {
  const refusal = { metric: 'analytics', used: null, limit: null, fix: null };

  it('names the plans whose feature list includes it, cheapest first, and omits the rest', () => {
    const html = render(BridgeUpgradeDialog, {
      refusal,
      upgradeHref: '/subscription',
      canUpgrade: true,
      onclose: () => {},
      feature: 'analytics',
      plans: PLANS,
    });
    const line = html.match(/<p[^>]*data-bridge-upgrade-dialog-included-in[^>]*>([\s\S]*?)<\/p>/)?.[1];
    expect(line?.replace(/\s+/g, ' ').trim()).toBe('Included in: Pro, Team');
    expect(line).not.toContain('Free');
  });

  it('says nothing about plans when no plan includes the feature, or no feature is named', () => {
    for (const feature of ['reports', undefined]) {
      const html = render(BridgeUpgradeDialog, {
        refusal, upgradeHref: '/subscription', canUpgrade: true, onclose: () => {}, feature, plans: PLANS,
      });
      expect(html).not.toContain('data-bridge-upgrade-dialog-included-in');
    }
  });

  it('with neither a refusal nor a feature, nothing renders', () => {
    const html = render(BridgeUpgradeDialog, {
      refusal: null, upgradeHref: '/subscription', canUpgrade: true, onclose: () => {}, feature: null, plans: PLANS,
    });
    expect(html).not.toContain('Included in');
    expect(html).not.toContain('data-bridge-upgrade-dialog-message');
  });

  // TBP-756 — a feature with no refusal is the dialog's feature variant.
  // BridgeBootstrap sets `feature` only after the person did something gated
  // (owner rule: nothing opens by itself), so the dialog renders it.
  it('a feature with no refusal renders the feature variant, naming the plans', () => {
    const html = render(BridgeUpgradeDialog, {
      refusal: null, upgradeHref: '/subscription', canUpgrade: true, onclose: () => {}, feature: 'analytics', plans: PLANS,
    });
    expect(html).toContain('data-variant="feature"');
    expect(html).toContain("This feature isn't on your plan");
    expect(html).toContain('Included in: Pro, Team');
  });

  it('plansIncludingFeature tolerates a missing plan list', () => {
    expect(plansIncludingFeature(null, 'analytics')).toEqual([]);
    expect(plansIncludingFeature(PLANS as never, 'sso')).toEqual(['Team']);
  });
});
