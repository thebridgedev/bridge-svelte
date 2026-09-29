// TBP-763 — seat limits on the built-in team page.
//
// Bridge's invite API does not refuse at the limit, so a Free plan with 2
// seats could get a third member through the team page. With `seatsMetric`
// the page gates Invite on the plan limit (QuotaGate), refuses an invite of
// more addresses than seats left, and re-reads the count after a team change.
// Without it, the page is unchanged.

import { afterEach, describe, expect, it, vi } from 'vitest';

const { quota, refreshed } = vi.hoisted(() => ({
  quota: { current: {} as Record<string, unknown> },
  refreshed: [] as string[],
}));

vi.mock('../../../core/use-quota.js', () => ({
  useQuota: () => new Proxy({}, { get: (_t, key: string) => quota.current[key] }),
}));
vi.mock('../../../core/billing-store.js', () => ({
  refreshQuota: (metric: string) => refreshed.push(metric),
}));
vi.mock('../../stores/config.store.js', () => ({ getConfig: () => ({}) }));

import { render as ssr } from 'svelte/server';
import TeamUserList from './TeamUserList.svelte';
import TeamManagementPanel from './TeamManagementPanel.svelte';
import { inviteSeatError, seatsChanged } from './seats.js';

function render(component: unknown, props: Record<string, unknown> = {}): string {
  return ssr(component as never, { props } as never).body;
}

function seats(used: number, limit: number) {
  return {
    loading: false,
    unlimited: false,
    used,
    limit,
    remaining: limit - used,
    snapshot: { metric: 'seats', used, limit, remaining: limit - used, policy: 'hard', kind: 'gauge' },
  };
}

/** The <fieldset> the gate puts around Invite, and whether it is disabled. */
function gate(html: string): { disabled: boolean } | null {
  const tag = html.match(/<fieldset[^>]*>/)?.[0];
  if (!tag) return null;
  return { disabled: /\sdisabled(=|\s|>)/.test(tag) };
}

afterEach(() => {
  quota.current = {};
  refreshed.length = 0;
});

describe('the team page with seatsMetric — TBP-763', () => {
  it('2 of 2 seats: Invite is disabled and the line says why, with the upgrade link', () => {
    quota.current = seats(2, 2);
    const html = render(TeamUserList, { seatsMetric: 'seats' });
    expect(html).toContain('data-metric="seats"');
    expect(gate(html)?.disabled).toBe(true);
    expect(html).toContain('All 2 seats on your plan are taken (pending invites count).');
    expect(html).toContain('href="/subscription"');
  });

  it('1 of 2 seats: Invite is enabled', () => {
    quota.current = seats(1, 2);
    const html = render(TeamUserList, { seatsMetric: 'seats' });
    expect(gate(html)?.disabled).toBe(false);
    expect(html).not.toContain('seats on your plan are taken');
  });

  it('TeamManagementPanel passes seatsMetric through to the users tab', () => {
    quota.current = seats(2, 2);
    const html = render(TeamManagementPanel, { seatsMetric: 'seats' });
    expect(gate(html)?.disabled).toBe(true);
  });

  it('without seatsMetric nothing changes: no gate, Invite enabled', () => {
    quota.current = seats(2, 2);
    const html = render(TeamManagementPanel);
    expect(html).not.toContain('data-bridge-quota-gate');
    expect(gate(html)).toBeNull();
    expect(html).toContain('Add Member');
  });
});

describe('an invite of several addresses cannot jump past the limit — TBP-763', () => {
  it('refuses more addresses than seats left, and says how many are left', () => {
    expect(inviteSeatError(2, 1)).toBe(
      'Your plan has 1 seat left, and this invites 2. Invite fewer people or upgrade your plan.',
    );
    expect(inviteSeatError(1, 0)).toMatch(/All seats on your plan are taken/);
  });

  it('lets an invite that fits through, and never guesses when the count is unknown', () => {
    expect(inviteSeatError(1, 1)).toBeNull();
    expect(inviteSeatError(5, null)).toBeNull();
    expect(inviteSeatError(5, undefined)).toBeNull();
  });
});

describe('after a team change the seat count is re-read — TBP-763', () => {
  it('re-reads the named seat metric', () => {
    seatsChanged('seats');
    expect(refreshed).toEqual(['seats']);
  });

  it('a page that does not count seats reads nothing', () => {
    seatsChanged(undefined);
    expect(refreshed).toEqual([]);
  });
});
