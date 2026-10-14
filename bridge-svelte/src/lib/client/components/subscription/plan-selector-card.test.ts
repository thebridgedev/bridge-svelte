// TBP-813 — the default plan card: a formatted price block, "Choose / Upgrade
// to / Switch to" buttons, the current plan flagged, and an optional heading.
//
// Real <PlanSelector> rendered with svelte/server (same harness as
// plan-features.test.ts). Its store and config are doubles; nothing else is.

import { describe, expect, it, vi } from 'vitest';

const { storeHolder } = vi.hoisted(() => ({
  storeHolder: { plans: [] as unknown[], status: null as unknown },
}));

vi.mock('../../../core/bridge-instance.js', async () => {
  const { readable } = await import('svelte/store');
  return {
    getBridgeAuth: () => ({}),
    loadSubscription: async () => {},
    ensureSubscription: async () => {},
    subscriptionStore: readable<unknown>(null, (set) => {
      set({ status: storeHolder.status, plans: storeHolder.plans, loading: false, error: null });
    }),
  };
});
vi.mock('../../stores/config.store.js', () => ({ getConfig: () => ({}) }));
vi.mock('$app/navigation', () => ({ goto: async () => {} }));

import { render as ssr } from 'svelte/server';
import PlanSelector from './PlanSelector.svelte';

const PLANS = [
  { key: 'free', name: 'Free', prices: [{ id: 'f', amount: 0, currency: 'usd', recurrenceInterval: 'month' }] },
  { key: 'pro', name: 'Pro', prices: [{ id: 'p', amount: 29, currency: 'usd', recurrenceInterval: 'month' }] },
  { key: 'team', name: 'Team', prices: [{ id: 't', amount: 99, currency: 'usd', recurrenceInterval: 'month' }] },
];

function render(opts: { status?: unknown; props?: Record<string, unknown> } = {}): string {
  storeHolder.plans = PLANS;
  storeHolder.status = opts.status ?? null;
  return ssr(PlanSelector as never, { props: opts.props ?? {} } as never).body;
}

/** The HTML of one plan card, found by its plan name. */
function card(html: string, name: string): string {
  const cards = html.split('data-bridge-plan-card').slice(1);
  const found = cards.find((c) => c.includes(`>${name}</h3>`));
  if (!found) throw new Error(`no card for ${name}`);
  return found;
}

/** The text of a card's select button. */
function buttonText(cardHtml: string): string {
  const m = cardHtml.match(/<button[^>]*bridge-plan-select-btn[^>]*>([\s\S]*?)<\/button>/);
  if (!m) throw new Error('no select button in card');
  return m[1].replace(/<!--[\s\S]*?-->/g, '').trim();
}

describe('<PlanSelector> default card — TBP-813', () => {
  it('with no current plan, every button is "Choose X" and no card is flagged', () => {
    const html = render();
    expect(buttonText(card(html, 'Free'))).toBe('Choose Free');
    expect(buttonText(card(html, 'Pro'))).toBe('Choose Pro');
    expect(buttonText(card(html, 'Team'))).toBe('Choose Team');
    expect(card(html, 'Pro')).toContain('data-pick="choose"');
    expect(html).not.toContain('data-bridge-plan-current-flag');
    // The old labels are gone.
    expect(html).not.toContain('Select free plan');
    expect(html).not.toContain('Select plan');
    expect(html).not.toContain('29 USD / month');
  });

  it('relative to the current plan: Current plan / Upgrade to / Switch to', () => {
    const html = render({ status: { plan: 'pro', paymentsEnabled: false } });

    const pro = card(html, 'Pro');
    expect(buttonText(pro)).toBe('Current plan');
    expect(pro).toContain('data-current="true"');
    expect(pro).toContain('data-pick="current"');
    expect(pro).toMatch(/<span[^>]*data-bridge-plan-current-flag[^>]*>Your plan<\/span>/);
    expect(pro).toMatch(/<button[^>]*disabled/);

    const team = card(html, 'Team');
    expect(buttonText(team)).toBe('Upgrade to Team');
    expect(team).toContain('data-pick="upgrade"');
    expect(team).toContain('bridge-btn-primary');
    expect(team).not.toContain('data-bridge-plan-current-flag');

    const free = card(html, 'Free');
    expect(buttonText(free)).toBe('Switch to Free');
    expect(free).toContain('data-pick="switch"');
    expect(free).toContain('bridge-btn-secondary');
  });

  it('reads a current plan given as an object, as the REST status returns it', () => {
    const html = render({ status: { plan: { key: 'team', name: 'Team' } } });
    expect(buttonText(card(html, 'Team'))).toBe('Current plan');
    expect(buttonText(card(html, 'Pro'))).toBe('Switch to Pro');
  });

  it('each card shows its price as a formatted amount and interval', () => {
    const html = render();
    const price = card(html, 'Pro').match(/<div[^>]*data-bridge-plan-price[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
    expect(price).toContain('$29');
    expect(price).toContain('/ month');
    expect(card(html, 'Free')).toContain('$0');
  });

  it('a heading renders above the plans only when given', () => {
    expect(render()).not.toContain('data-bridge-plan-head');
    const html = render({ props: { heading: 'Change plan' } });
    expect(html).toMatch(/<h2[^>]*class="bridge-plan-heading"[^>]*>Change plan<\/h2>/);
  });
});
