// TBP-669 — a realtime refusal because this page's origin is missing from the
// app's allowed origins reads as `origin_not_allowed`, side `config`, with the
// fix — in `realtimeStatusDetail` and in the dev badge — whichever auth-core
// is installed (`/realtime/diagnose` itself says side `app`).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { RealtimeStatus } from '@nebulr-group/bridge-auth-core';
import { realtimeBadgeView } from './realtime-dev-badge.js';
import { _setRealtimeStatusDetail, normalizeRealtimeStatus, realtimeStatusDetail } from './realtime-status.js';

const ORIGIN = 'http://localhost:5181';
const ADMIN_PATH = 'Authentication → Security → Allowed Origins';
type WithHint = RealtimeStatus & { hint?: string };

// What an auth-core before TBP-669 passes through from /realtime/diagnose.
const fromServer: RealtimeStatus = {
  state: 'unauthorized',
  reason: 'origin_not_allowed',
  side: 'app',
  retrying: false,
  docsUrl: 'https://thebridge.dev/docs/live-updates/troubleshooting/#origin_not_allowed',
  ref: 'r1',
  since: 1,
};

beforeEach(() => vi.stubGlobal('location', { origin: ORIGIN }));
afterEach(() => vi.unstubAllGlobals());

describe('realtimeStatusDetail — origin_not_allowed', () => {
  it('is side config with the fix, whatever side the server reported', () => {
    _setRealtimeStatusDetail(fromServer);
    const status = get(realtimeStatusDetail) as WithHint;
    expect(status).toMatchObject({ state: 'unauthorized', reason: 'origin_not_allowed', side: 'config' });
    expect(status.hint).toContain(ORIGIN);
    expect(status.hint).toContain(ADMIN_PATH);
  });

  it('keeps a hint auth-core already supplied, and leaves other reasons untouched', () => {
    const withHint = { ...fromServer, side: 'config', hint: 'from auth-core' } as WithHint;
    expect((normalizeRealtimeStatus(withHint) as WithHint).hint).toBe('from auth-core');
    const other: RealtimeStatus = { ...fromServer, reason: 'expired', side: 'app' };
    expect(normalizeRealtimeStatus(other)).toBe(other);
  });
});

describe('dev badge — origin_not_allowed', () => {
  it('names the allowed origins, not apiBaseUrl / appId, and shows the fix', () => {
    const view = realtimeBadgeView({ ...fromServer, state: 'degraded', side: 'config' }, undefined, 0);
    expect(view?.reason).toBe('origin_not_allowed');
    expect(view?.sideLabel).toMatch(/allowed origins/);
    expect(view?.sideLabel).not.toMatch(/apiBaseUrl/);
    expect(view?.hint).toContain(ORIGIN);
    expect(view?.hint).toContain(ADMIN_PATH);
  });

  it('shows while open when some channels were refused with a reason, and not otherwise', () => {
    const partial: RealtimeStatus = { state: 'open', reason: 'origin_not_allowed', side: 'config', retrying: false, since: 1 };
    expect(realtimeBadgeView(partial, undefined, 0)).toMatchObject({ reason: 'origin_not_allowed' });
    expect(realtimeBadgeView({ state: 'open', retrying: false, since: 1 }, undefined, 0)).toBeNull();
  });

  it('adds no hint for reasons it has no fix sentence for', () => {
    const view = realtimeBadgeView({ ...fromServer, reason: 'wrong_environment', side: 'config' }, undefined, 0);
    expect(view?.hint).toBeUndefined();
  });
});
