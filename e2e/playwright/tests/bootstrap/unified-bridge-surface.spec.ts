/**
 * Phase 4 (TBP-326) — Playwright spec for the unified `bridge` read surface.
 *
 * Verifies the end-to-end snapshot flow:
 *   1. After authenticated bootstrap completes, `bridge.tenant.id` resolves
 *      to a non-null workspaceId.
 *   2. `bridge.user.email` resolves to the logged-in test email.
 *   3. `bridge.tenant.subscription.plan.slug` exposes the current plan.
 *   4. `bridge.tenant.entitlements.can(...)` answers synchronously.
 *   5. `bridge.app.plans` is lazy (null) before .load(); resolves after.
 *
 * Every assertion here reads a slice of the AUTHENTICATED session snapshot —
 * `bridge.tenant`, `bridge.user`, the entitlement map, and `bridge.app.plans`
 * (whose `load()` calls `BridgeAuth.getPlans`, which throws `Not authenticated`
 * without a session). So each test takes `authenticatedPage`, not `page`.
 *
 * TBP-607: the file was written with the plain `page` fixture and marked
 * "NOT YET RUN". When the stage suite first ran it, all three tests failed on
 * an anonymous page — `waitForFunction` never resolving, `app_active` false,
 * and `getPlans` throwing `Not authenticated`. Authenticating fixes the third
 * test outright, because `bridge.app.plans` is REST-backed.
 *
 * The other two stay red on a real defect, now TBP-686: the `session.snapshot`
 * push never arrives on a FIRST connect (reproduced on local/Centrifugo and
 * stage/AppSync alike), and the `GET /session/init` repair TBP-660 added is
 * gated on `_connectedOnce`, so it only ever covers reconnects. `bridge.user`
 * and `bridge.tenant.subscription` have JWT/REST fallbacks and look fine;
 * `tenant.id`, `tenant.name`, `entitlements` and `app.branding` have none and
 * stay null. These two tests are the regression coverage for that fix — they
 * are deliberately left failing rather than weakened.
 */

import { test, expect } from '../../fixtures/auth';
import { MED_TIMEOUT } from '../../fixtures/timeouts';

test.describe('Unified bridge surface — session.snapshot end-to-end', () => {
  test('snapshot lands and populates bridge.tenant + bridge.user', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/');

    // The demo exposes `window.bridge` for e2e access (see TBP-325 demo update).
    // If the demo doesn't expose it yet, this test asserts the harness's
    // bridge import via a small probe script injected into the page.
    const result = await page.waitForFunction(
      () => {
        const w = window as unknown as {
          bridge?: {
            tenant: {
              id: { subscribe: (fn: (v: string | null) => void) => () => void };
              subscription: { subscribe: (fn: (v: unknown) => void) => () => void };
            };
            user: { subscribe: (fn: (v: unknown) => void) => () => void };
          };
        };
        if (!w.bridge) return null;
        let tenantId: string | null = null;
        let subscription: any = null;
        let user: any = null;
        const u1 = w.bridge.tenant.id.subscribe((v) => { tenantId = v; });
        const u2 = w.bridge.tenant.subscription.subscribe((v) => { subscription = v; });
        const u3 = w.bridge.user.subscribe((v) => { user = v; });
        u1(); u2(); u3();
        return tenantId && subscription && user ? { tenantId, subscription, user } : null;
      },
      { timeout: MED_TIMEOUT },
    );

    const value = await result.jsonValue();
    expect(value).not.toBeNull();
    expect(value.tenantId).toMatch(/.+/);
    expect(value.subscription.plan).toBeDefined();
    expect(value.subscription.plan.slug).toMatch(/.+/);
    expect(value.user.id).toMatch(/.+/);
    expect(value.user.tenantId).toBe(value.tenantId);
  });

  test('entitlements.can() answers from the snapshot map', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/');

    const canApp = await page.waitForFunction(
      () => {
        const w = window as unknown as { bridge?: { tenant: { entitlements: { can: (k: string) => boolean } } } };
        if (!w.bridge) return null;
        // app_active is the canonical "is the workspace allowed in" entitlement;
        // every active workspace should report true.
        return { app_active: w.bridge.tenant.entitlements.can('app_active') };
      },
      { timeout: MED_TIMEOUT },
    );
    const value = await canApp.jsonValue();
    expect(value).toEqual({ app_active: true });
  });

  test('bridge.app.plans is lazy — null until .load(), populated after', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/');

    // What the first evaluate needs is `window.bridge`, so wait for that — the
    // same probe the other tests in this file use. Waiting for the network to go
    // idle would never return: the demo holds a Centrifugo WebSocket (TBP-605).
    await page.waitForFunction(
      () => !!(window as unknown as { bridge?: unknown }).bridge,
      undefined,
      { timeout: MED_TIMEOUT },
    );

    // Initially null.
    const initial = await page.evaluate(() => {
      const w = window as unknown as { bridge?: { app: { plans: { _peek: () => unknown; isLoaded: boolean } } } };
      return w.bridge ? { value: w.bridge.app.plans._peek(), isLoaded: w.bridge.app.plans.isLoaded } : null;
    });
    expect(initial?.isLoaded).toBe(false);
    expect(initial?.value).toBeNull();

    // After .load(), value populated.
    const loaded = await page.evaluate(async () => {
      const w = window as unknown as { bridge?: { app: { plans: { load: () => Promise<unknown[]>; isLoaded: boolean } } } };
      if (!w.bridge) return null;
      const v = await w.bridge.app.plans.load();
      return { len: Array.isArray(v) ? v.length : -1, isLoaded: w.bridge.app.plans.isLoaded };
    });
    expect(loaded?.isLoaded).toBe(true);
    expect(loaded?.len).toBeGreaterThan(0);
  });
});
