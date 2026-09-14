// TBP-644 — the development-only "Live updates off — why?" badge.
//
// Rendered with `svelte/server`: the vitest environment has no DOM, and what
// matters most here — does it render at all, in which build, with which
// config — is fully visible in the server-rendered HTML.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readable } from 'svelte/store';
import type { RealtimeStatus } from '@nebulr-group/bridge-auth-core';
import {
  REALTIME_BADGE_RETRYING_AFTER_MS,
  createRetryClock,
  realtimeBadgeView,
} from './realtime-dev-badge.js';

const unauthorized: RealtimeStatus = {
  state: 'unauthorized',
  reason: 'wrong_environment',
  side: 'config',
  retrying: false,
  docsUrl: 'https://thebridge.dev/docs/live-updates/troubleshooting/#wrong_environment',
  ref: '0badf00d',
  since: 1,
};
const degraded: RealtimeStatus = { state: 'degraded', reason: 'no_channel_accepted', retrying: false, since: 1 };
const open: RealtimeStatus = { state: 'open', retrying: false, since: 1 };
const retrying: RealtimeStatus = {
  state: 'connecting',
  reason: 'connection_lost',
  side: 'network',
  retrying: true,
  ref: 'r1',
  since: 1,
};

describe('realtimeBadgeView', () => {
  it('shows for unauthorized, with reason, whose side, docs link and ref', () => {
    const view = realtimeBadgeView(unauthorized, undefined, 0);
    expect(view).toMatchObject({
      reason: 'wrong_environment',
      docsUrl: unauthorized.docsUrl,
      ref: '0badf00d',
    });
    expect(view?.sideLabel).toMatch(/Bridge settings/);
  });

  it('shows for degraded and builds the docs link from the reason', () => {
    expect(realtimeBadgeView(degraded, undefined, 0)).toMatchObject({
      reason: 'no_channel_accepted',
      docsUrl: 'https://thebridge.dev/docs/live-updates/troubleshooting/#no_channel_accepted',
    });
  });

  it('stays hidden while open', () => {
    expect(realtimeBadgeView(open, undefined, 0)).toBeNull();
  });

  it('stays hidden while retrying for less than 30 s, and shows after', () => {
    expect(realtimeBadgeView(retrying, 0, REALTIME_BADGE_RETRYING_AFTER_MS - 1)).toBeNull();
    expect(realtimeBadgeView(retrying, 0, REALTIME_BADGE_RETRYING_AFTER_MS)).toMatchObject({
      reason: 'connection_lost',
      sideLabel: expect.stringMatching(/network/i),
    });
  });

  it('keys a retry run by its ref, not by the closed/connecting flips inside it', () => {
    const a = realtimeBadgeView({ ...retrying, state: 'closed' }, 0, 60_000);
    const b = realtimeBadgeView({ ...retrying, state: 'connecting' }, 0, 60_000);
    expect(a?.key).toBe(b?.key);
    expect(realtimeBadgeView({ ...retrying, ref: 'r2' }, 0, 60_000)?.key).not.toBe(a?.key);
  });
});

describe('createRetryClock', () => {
  it('measures a retry run from its first status, across state flips, and resets on recovery', () => {
    const clock = createRetryClock();
    expect(clock(retrying, 100)).toBe(100);
    expect(clock({ ...retrying, state: 'closed' }, 5_000)).toBe(100);
    expect(clock({ ...retrying, ref: 'r2' }, 9_000)).toBe(9_000); // a new episode
    expect(clock(open, 10_000)).toBeUndefined();
    expect(clock(retrying, 11_000)).toBe(11_000);
  });
});

// ── Rendering ───────────────────────────────────────────────────────────────

async function renderBadge(opts: { dev: boolean; status?: RealtimeStatus; enabled?: boolean }): Promise<string> {
  vi.resetModules();
  vi.doMock('$app/environment', () => ({ dev: opts.dev, browser: false, building: false, version: 'test' }));
  const { _setRealtimeStatusDetail } = await import('./realtime-status.js');
  if (opts.status) _setRealtimeStatusDetail(opts.status);
  const { default: Badge } = await import('../client/components/developer/RealtimeDevBadge.svelte');
  const { render } = await import('svelte/server');
  return render(Badge, { props: opts.enabled === undefined ? {} : { enabled: opts.enabled } }).body;
}

afterEach(() => {
  vi.doUnmock('$app/environment');
  vi.doUnmock('$app/navigation');
  vi.doUnmock('$app/stores');
  vi.doUnmock('../auth/route-guard.js');
  vi.doUnmock('../client/stores/config.store.js');
});

describe('<RealtimeDevBadge>', () => {
  it('renders in a development build while live updates are off', async () => {
    const html = await renderBadge({ dev: true, status: unauthorized });
    expect(html).toContain('Live updates off — why?');
    expect(html).toContain('data-testid="bridge-realtime-dev-badge"');
    // Accessible: a real button that says it controls a collapsed panel, and
    // a polite live region that announces the reason.
    expect(html).toMatch(/<button[^>]*type="button"[^>]*aria-expanded="false"/);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Bridge live updates are off: wrong_environment');
  });

  it('renders nothing in a production build', async () => {
    const html = await renderBadge({ dev: false, status: unauthorized });
    expect(html).not.toContain('bridge-realtime-dev-badge');
    expect(html).not.toContain('Live updates off');
  });

  it('renders nothing when opted out', async () => {
    const html = await renderBadge({ dev: true, status: unauthorized, enabled: false });
    expect(html).not.toContain('bridge-realtime-dev-badge');
  });

  it('renders no badge while live updates are working', async () => {
    const html = await renderBadge({ dev: true, status: open });
    expect(html).not.toContain('Live updates off');
  });
});

// ── Mounted automatically by <BridgeBootstrap /> ────────────────────────────

async function renderBootstrap(opts: { dev: boolean; devBadge?: boolean }): Promise<string> {
  vi.resetModules();
  vi.doMock('$app/environment', () => ({ dev: opts.dev, browser: false, building: false, version: 'test' }));
  vi.doMock('$app/navigation', () => ({ beforeNavigate: () => {}, goto: async () => {} }));
  vi.doMock('$app/stores', () => ({ page: readable({ url: new URL('http://localhost/') }) }));
  // The route guard needs an initialised BridgeAuth; this test is about markup.
  vi.doMock('../auth/route-guard.js', () => ({
    createRouteGuard: () => ({ getNavigationDecision: async () => ({ type: 'allow' }) }),
    routeRulesReferenceFlag: () => false,
  }));
  vi.doMock('../client/stores/config.store.js', () => ({
    getConfig: () => ({ appId: 'app-1', apiBaseUrl: 'http://test', devBadge: opts.devBadge }),
    getRouteGuardConfig: () => null,
  }));
  const { _setRealtimeStatusDetail } = await import('./realtime-status.js');
  _setRealtimeStatusDetail(unauthorized);
  const { default: BridgeBootstrap } = await import('../client/BridgeBootstrap.svelte');
  const { render } = await import('svelte/server');
  return render(BridgeBootstrap, { props: {} }).body;
}

describe('<BridgeBootstrap> mounts the badge', () => {
  it('without any app code in a development build', async () => {
    expect(await renderBootstrap({ dev: true })).toContain('Live updates off — why?');
  });

  it('and respects devBadge: false', async () => {
    expect(await renderBootstrap({ dev: true, devBadge: false })).not.toContain('bridge-realtime-dev-badge');
  });

  it('and never in a production build', async () => {
    expect(await renderBootstrap({ dev: false })).not.toContain('bridge-realtime-dev-badge');
  });
});
