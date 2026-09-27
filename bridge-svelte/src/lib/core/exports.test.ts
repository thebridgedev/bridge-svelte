// TBP-697 — everything the guides say not to rebuild resolves from the package
// root, and `setBridgeContext` really overrides `useBridge()` for children.

import { describe, expect, it, vi } from 'vitest';

// The root barrel pulls in SvelteKit-only components; stand in for `$app/*`.
vi.mock('$app/environment', () => ({ dev: false, browser: false, building: false, version: 'test' }));
vi.mock('$app/navigation', () => ({ beforeNavigate: () => {}, afterNavigate: () => {}, goto: async () => {} }));
vi.mock('$app/stores', async () => {
  const { readable } = await import('svelte/store');
  return { page: readable({ url: new URL('http://localhost/'), params: {} }) };
});
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/'), params: {} } }));

import * as pkg from '../index.js';
import { bridge } from './bridge.js';
import type { BridgeSurface } from './bridge.js';

async function render(component: unknown, props: Record<string, unknown> = {}): Promise<string> {
  const { render: ssr } = await import('svelte/server');
  return ssr(component as never, { props } as never).body;
}

describe('package root exports (TBP-697)', () => {
  it('exports the hooks and stores: useBridge, setBridgeContext, useQuota, entitlements, bridgeFetch', () => {
    expect(pkg.useBridge()).toBe(bridge);
    expect(typeof pkg.setBridgeContext).toBe('function');
    expect(typeof pkg.useQuota).toBe('function');
    expect(typeof pkg.entitlements.subscribe).toBe('function');
    expect(typeof pkg.bridgeFetch).toBe('function');
  });

  it('bridge.usage has report, set and getQueueStatus', () => {
    expect(typeof pkg.bridge.usage.report).toBe('function');
    expect(typeof pkg.bridge.usage.set).toBe('function');
    expect(typeof pkg.bridge.usage.getQueueStatus).toBe('function');
  });

  it('the team dialogs and the billing-portal button can be placed on any page', async () => {
    const confirm = await render(pkg.TeamConfirmDialog, { open: false, title: 'Remove Ada?', message: 'She loses access.' });
    expect(confirm).toContain('<dialog');
    expect(confirm).toContain('Remove Ada?');

    expect(await render(pkg.TeamAddUserDialog)).toContain('<dialog');
    expect(await render(pkg.TeamEditUserDialog)).toContain('<dialog');
    expect(await render(pkg.TeamUserActionsMenu)).toMatch(/<button/);
    // BillingPortalButton (exported by TBP-702) renders only for a billing admin,
    // so an anonymous SSR render is empty — assert it is the component.
    expect(typeof pkg.BillingPortalButton).toBe('function');
  });

  it('BridgeProvider is kept, deprecated, as the same component as BridgeBootstrap', () => {
    expect(pkg.BridgeProvider).toBe(pkg.BridgeBootstrap);
  });
});

describe('setBridgeContext (TBP-697)', () => {
  it('a parent’s override is what useBridge() returns below it; without one it is the singleton', async () => {
    const Reader = (await import('./UseBridgeReader.test.svelte')).default;
    const Override = (await import('./UseBridgeOverride.test.svelte')).default;

    expect(await render(Reader)).toContain('data-surface="singleton"');

    const fixture = { ...bridge, __label: 'fixture' } as unknown as BridgeSurface;
    expect(await render(Override, { fixture })).toContain('data-surface="fixture"');
  });
});
