// TBP-697 — at exactly a hard limit the quota banner says the limit is reached.
//
// Owner run on stage, 2026-09-29: 2 of 2 clicks on a hard quota read
// "approaching its clicks cap". The server sends `critical` from 95% and has no
// "reached" state for hard quotas; the banner's own fallback was `used > limit`.

import { describe, expect, it, vi } from 'vitest';

const { banner } = vi.hoisted(() => ({ banner: { snap: undefined as unknown } }));

vi.mock('../core/bridge-instance.js', () => ({
  getBridgeAuth: () => {
    throw new Error('Bridge not initialised'); // the member variant
  },
}));
vi.mock('@nebulr-group/bridge-auth-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nebulr-group/bridge-auth-core')>();
  return {
    ...actual,
    useBridge: () => ({ quota: () => banner.snap, quotas: { subscribe: () => () => {} } }),
  };
});

import type { QuotaSnapshot } from '@nebulr-group/bridge-auth-core';
import { render as ssr } from 'svelte/server';
import BridgeQuotaBanner from './components/subscription/BridgeQuotaBanner.svelte';
import { quotaBannerCopy, quotaBannerState } from './quota-banner-copy.js';

function hard(used: number, limit: number, warningLevel: QuotaSnapshot['warningLevel']): QuotaSnapshot {
  return { metric: 'clicks', used, limit, remaining: limit - used, warningLevel, policy: 'hard' } as QuotaSnapshot;
}

describe('quota banner state — TBP-697', () => {
  it('2 of 2 on a hard quota is "reached", whatever warning level the server sent', () => {
    expect(quotaBannerState(hard(2, 2, 'critical'))).toBe('reached');
    expect(quotaBannerState(hard(2, 2, 'approaching'))).toBe('reached');
    expect(quotaBannerState(hard(2, 2, null))).toBe('reached');
  });

  it('under the limit keeps the server’s level; over it is "over"', () => {
    expect(quotaBannerState(hard(19, 20, 'critical'))).toBe('critical');
    expect(quotaBannerState(hard(16, 20, 'approaching'))).toBe('approaching');
    expect(quotaBannerState(hard(1, 20, null))).toBe('hidden');
    expect(quotaBannerState(hard(3, 2, 'critical'))).toBe('over');
  });

  it('a metered quota at its included amount is not "reached" — it bills instead of blocking', () => {
    const metered = { ...hard(2, 2, 'critical'), policy: 'metered' } as QuotaSnapshot;
    expect(quotaBannerState(metered)).toBe('metered');
  });
});

describe('quota banner copy at the limit — TBP-697', () => {
  it('a member reads that the limit is reached, and whom to ask', () => {
    const copy = quotaBannerCopy(hard(2, 2, 'critical'), false, 'clicks');
    expect(copy.title).toBe('clicks limit reached');
    expect(copy.body).toBe('Your workspace has reached its clicks limit. Contact your workspace owner.');
    expect(`${copy.title} ${copy.body}`).not.toMatch(/approaching|near cap/);
    expect(copy.cta).toBeUndefined();
  });

  it('an owner reads the same, with the Upgrade call to action', () => {
    const copy = quotaBannerCopy(hard(2, 2, 'critical'), true, 'clicks');
    expect(copy.title).toBe('clicks limit reached');
    expect(copy.body).toMatch(/used all 2 on your plan/);
    expect(copy.cta).toBe('Upgrade');
  });
});

describe('<BridgeQuotaBanner> rendered at 2 of 2 — TBP-697', () => {
  it('says "limit reached", as an alert, never "approaching"', () => {
    banner.snap = hard(2, 2, 'critical');
    const html = ssr(BridgeQuotaBanner as never, { props: { metric: 'clicks' } } as never).body;
    expect(html).toContain('clicks limit reached');
    expect(html).toContain('has reached its clicks limit');
    expect(html).not.toContain('approaching');
    expect(html).toContain('role="alert"');
  });

  it('at 1 of 2 with no warning level it renders nothing', () => {
    banner.snap = hard(1, 2, null);
    const html = ssr(BridgeQuotaBanner as never, { props: { metric: 'clicks' } } as never).body;
    expect(html).not.toContain('bridge-quota-banner');
  });
});
