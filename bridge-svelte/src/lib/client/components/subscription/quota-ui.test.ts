// TBP-703 — level 1 (<QuotaGate>, <Entitled>) and the level-0 dialog, rendered.
//
// The rule every case here protects: "not loaded yet" is never "zero" and never
// "not allowed". A gate that disables on an unknown quota switches a feature
// off for good on a workspace whose quota never hydrates; an <Entitled> that
// shows the fallback while loading flashes a paywall at a paying customer.
//
// useQuota and the entitlements store are replaced with controllable doubles;
// the components themselves are the real ones, rendered with svelte/server.

import { afterEach, describe, expect, it, vi } from 'vitest';

const { quota, ents } = vi.hoisted(() => ({
  quota: { current: {} as Record<string, unknown> },
  ents: { current: { ready: false, all: {} as Record<string, boolean> } },
}));

vi.mock('../../../core/use-quota.js', () => ({
  useQuota: () =>
    new Proxy({}, { get: (_t, key: string) => quota.current[key] }),
}));

vi.mock('../../../core/entitlements.js', async () => {
  const { readable } = await import('svelte/store');
  return {
    entitlements: readable<unknown>(null, (set) => {
      set({ ready: ents.current.ready, all: ents.current.all, can: (k: string) => ents.current.all[k] === true });
    }),
  };
});

const { config } = vi.hoisted(() => ({ config: { current: {} as Record<string, unknown> } }));
vi.mock('../../stores/config.store.js', () => ({ getConfig: () => config.current }));

import { render as ssr } from 'svelte/server';
import QuotaGateFixture from './QuotaGateFixture.test.svelte';
import EntitledFixture from './EntitledFixture.test.svelte';
import BridgeUpgradeDialog from './BridgeUpgradeDialog.svelte';
import { resolveUpgradeDialog, upgradeHrefFor } from '../../upgrade-dialog.js';
import { quotaMemberBody } from '../../billing-role.js';

function render(component: unknown, props: Record<string, unknown> = {}): string {
  return ssr(component as never, { props } as never).body;
}

const LOADING = { loading: true, unlimited: false, used: null, limit: null, remaining: null, snapshot: null };
const UNLIMITED = { loading: false, unlimited: true, used: null, limit: null, remaining: null, snapshot: null };
function limited(used: number, limit: number, policy: 'hard' | 'metered' = 'hard') {
  return {
    loading: false,
    unlimited: false,
    used,
    limit,
    remaining: limit - used,
    snapshot: { metric: 'tickets', used, limit, remaining: limit - used, policy },
  };
}

/** The <fieldset> around the children, and whether it is disabled. */
function fieldset(html: string): { disabled: boolean } {
  const tag = html.match(/<fieldset[^>]*>/)?.[0];
  if (!tag) throw new Error(`no <fieldset> in: ${html}`);
  return { disabled: /\sdisabled(=|\s|>)/.test(tag) };
}

afterEach(() => {
  config.current = {};
});

describe('<QuotaGate metric> — TBP-703', () => {
  it('while the quota is loading: the action is ENABLED and the gate says it is loading', () => {
    quota.current = LOADING;
    const html = render(QuotaGateFixture);
    expect(fieldset(html).disabled).toBe(false);
    expect(html).toContain('data-state="loading"');
    expect(html).toContain('data-testid="action"');
    expect(html).not.toContain('data-bridge-quota-gate-limit');
  });

  it('a hard quota nothing has been reported against (0 of 3) is available, not disabled', () => {
    quota.current = limited(0, 3);
    const html = render(QuotaGateFixture);
    expect(fieldset(html).disabled).toBe(false);
    expect(html).toContain('data-state="available"');
  });

  it('under the cap: enabled, no prompt', () => {
    quota.current = limited(2, 3);
    const html = render(QuotaGateFixture);
    expect(fieldset(html).disabled).toBe(false);
    expect(html).not.toContain('data-bridge-quota-gate-limit');
  });

  it('at a hard cap: disabled, with the default prompt linking to the subscription page', () => {
    quota.current = limited(3, 3);
    const html = render(QuotaGateFixture);
    expect(fieldset(html).disabled).toBe(true);
    expect(html).toContain('data-state="at-limit"');
    expect(html).toMatch(/You've used all 3 tickets on your plan\./);
    expect(html).toContain('href="/subscription"');
  });

  it('the default prompt follows billing.manageRoute', () => {
    config.current = { billing: { manageRoute: '/billing' } };
    quota.current = limited(3, 3);
    expect(render(QuotaGateFixture)).toContain('href="/billing"');
  });

  it('over a hard cap (remaining negative) is also at the limit', () => {
    quota.current = limited(5, 3);
    expect(fieldset(render(QuotaGateFixture)).disabled).toBe(true);
  });

  it('the atLimit snippet replaces the default prompt and receives the quota', () => {
    quota.current = limited(3, 3);
    const html = render(QuotaGateFixture, { custom: true });
    expect(fieldset(html).disabled).toBe(true);
    expect(html).toContain('3/3 used — talk to sales');
    expect(html).not.toContain("You've used all");
  });

  it('a metered quota never gates, even past its included amount', () => {
    quota.current = limited(12, 10, 'metered');
    const html = render(QuotaGateFixture);
    expect(fieldset(html).disabled).toBe(false);
    expect(html).toContain('data-state="metered"');
  });

  it('no quota on the plan (unlimited) never gates', () => {
    quota.current = UNLIMITED;
    const html = render(QuotaGateFixture);
    expect(fieldset(html).disabled).toBe(false);
    expect(html).toContain('data-state="unlimited"');
  });
});

describe('<Entitled to> — TBP-703', () => {
  it('before Bridge answers: neither the feature nor the fallback', () => {
    ents.current = { ready: false, all: {} };
    const html = render(EntitledFixture);
    expect(html).not.toContain('data-testid="feature"');
    expect(html).not.toContain('data-testid="fallback"');
  });

  it('before Bridge answers: the loading snippet, when given', () => {
    ents.current = { ready: false, all: {} };
    const html = render(EntitledFixture, { withLoading: true });
    expect(html).toContain('data-testid="checking"');
    expect(html).not.toContain('data-testid="fallback"');
  });

  it('entitled: the children', () => {
    ents.current = { ready: true, all: { analytics: true } };
    const html = render(EntitledFixture, { withLoading: true });
    expect(html).toContain('data-testid="feature"');
    expect(html).not.toContain('data-testid="fallback"');
    expect(html).not.toContain('data-testid="checking"');
  });

  it('answered and not entitled: the fallback', () => {
    ents.current = { ready: true, all: { analytics: false, sso: true } };
    const html = render(EntitledFixture);
    expect(html).toContain('data-testid="fallback"');
    expect(html).not.toContain('data-testid="feature"');
  });
});

describe('<BridgeUpgradeDialog> — TBP-703', () => {
  const refusal = { metric: 'tickets', used: 3, limit: 3, fix: '/subscription', message: null, url: '/api/tickets' };

  it('names the metric and the numbers, and links to the upgrade path', () => {
    const html = render(BridgeUpgradeDialog, { refusal, upgradeHref: '/subscription?from=tickets', canUpgrade: true, onclose: () => {} });
    expect(html).toContain('data-metric="tickets"');
    expect(html).toMatch(/used <strong>3<\/strong> of\s*<strong>3<\/strong>\s*<strong[^>]*>tickets<\/strong>/);
    expect(html).toContain('href="/subscription?from=tickets"');
  });

  it('without numbers it says the limit is reached — never "0 of 0"', () => {
    const html = render(BridgeUpgradeDialog, {
      refusal: { ...refusal, used: null, limit: null },
      upgradeHref: '/subscription',
      canUpgrade: true,
      onclose: () => {},
    });
    expect(html).toMatch(/reached its <strong[^>]*>tickets<\/strong> limit/);
    expect(html).not.toContain('>0<');
  });

  it('a member who cannot manage billing is told who to ask — the banner’s wording — and gets no Upgrade link', () => {
    const html = render(BridgeUpgradeDialog, { refusal, upgradeHref: '/subscription', canUpgrade: false, onclose: () => {} });
    expect(html).toContain('data-variant="member"');
    expect(html).toContain(quotaMemberBody('tickets', 'over'));
    expect(html).toContain('Contact your workspace owner.');
    expect(html).not.toContain('data-bridge-upgrade-dialog-cta');
    expect(html).not.toContain('href="/subscription"');
    expect(html).not.toContain('Upgrade the plan');
  });

  it('an owner/admin keeps the Upgrade link and is not told to contact anyone', () => {
    const html = render(BridgeUpgradeDialog, { refusal, upgradeHref: '/subscription', canUpgrade: true, onclose: () => {} });
    expect(html).toContain('data-variant="admin"');
    expect(html).toMatch(/<a[^>]*href="\/subscription"[^>]*data-bridge-upgrade-dialog-cta/);
    expect(html).not.toContain('Contact your workspace owner');
  });

  it('with nothing refused it has no content', () => {
    const html = render(BridgeUpgradeDialog, { refusal: null, upgradeHref: '/subscription', canUpgrade: true, onclose: () => {} });
    expect(html).not.toContain('data-bridge-upgrade-dialog-cta');
  });
});

describe('billing.upgradeDialog / the upgrade link — TBP-703', () => {
  it('on by default; false turns it off; a component replaces it', () => {
    const Mine = (() => {}) as never;
    expect(resolveUpgradeDialog(undefined)).toBe('default');
    expect(resolveUpgradeDialog({})).toBe('default');
    expect(resolveUpgradeDialog({ upgradeDialog: true })).toBe('default');
    expect(resolveUpgradeDialog({ upgradeDialog: false })).toBeNull();
    expect(resolveUpgradeDialog({ upgradeDialog: Mine })).toBe(Mine);
  });

  it('the button goes to the refusal’s fix, else manageRoute, else /subscription', () => {
    expect(upgradeHrefFor({ fix: '/pricing' }, { manageRoute: '/billing' })).toBe('/pricing');
    expect(upgradeHrefFor({ fix: null }, { manageRoute: '/billing' })).toBe('/billing');
    expect(upgradeHrefFor(null, undefined)).toBe('/subscription');
  });
});
