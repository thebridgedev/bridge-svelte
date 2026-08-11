// Billing CTA destination — config-driven manage route (TBP-451 / S1).
//
// Under test: the destination precedence shared by <BridgeBillingNotice> and
// <BridgeQuotaBanner>:
//
//   onActionClick callback  (highest — short-circuits, no navigation at all)
//     → `actionHref` prop
//       → getConfig().billing?.manageRoute
//         → '/billing'                                          (default)
//
// HARNESS NOTE: bridge-svelte's vitest config (vitest.config.ts) runs in a
// `node` environment with no Svelte compiler plugin and no DOM (jsdom /
// happy-dom / @testing-library/svelte are NOT installed anywhere in the
// workspace), so neither component can be mounted here. Following the
// established pattern in billing-notice-gate.test.ts and plan-selector.test.ts,
// this file exercises an EXACT replica of the components' `handleAction()`
// script-block logic, with the external singletons (`getConfig` from
// config.store.js and `window.location`) injected as mocks instead of
// module-mocking them.
//
// The replicas below mirror, line for line:
//   - BridgeBillingNotice.svelte  `function handleAction()`
//   - BridgeQuotaBanner.svelte    `function handleAction()`
//
// The two differ only in (a) the argument handed to `onActionClick`
// (BillingNoticeState vs QuotaSnapshot) and (b) the quota banner's
// `if (!snapshot) return;` guard. The destination resolution is byte-identical
// and MUST stay that way — the "both components agree" block below is the
// regression guard for that.
//
// If either component's handleAction changes, update the replica here to
// match — a drift between the two is a test bug, not a component bug.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Injected doubles ─────────────────────────────────────────────────────────

/** Shape of the slice of BridgeConfig the handler reads. */
interface BillingConfigSlice {
  billing?: { manageRoute?: string };
}

/**
 * Stand-in for `getConfig()` from config.store.js. The real one THROWS when
 * `initConfig()` has not run — the handler swallows that in a `try/catch` and
 * falls through to the default, so the throwing variant is a first-class case.
 */
type GetConfig = () => BillingConfigSlice;

const configWith = (manageRoute?: string): GetConfig => () =>
  manageRoute === undefined ? {} : { billing: { manageRoute } };

const uninitializedConfig: GetConfig = () => {
  throw new Error(
    'Config has not been initialized. Call  initConfig(...) early in app startup.',
  );
};

/** Config initialized, but the app never declared a `billing` block. */
const configWithoutBillingBlock: GetConfig = () => ({});

// ── Replica: BridgeBillingNotice.svelte handleAction() ───────────────────────

interface NoticeHarnessOptions {
  getConfig?: GetConfig;
  actionHref?: string;
  onActionClick?: (state: string) => void;
  /** Emulates SSR, where `typeof window === 'undefined'`. */
  hasWindow?: boolean;
}

function makeNoticeHarness(opts: NoticeHarnessOptions = {}) {
  const {
    getConfig = uninitializedConfig,
    actionHref,
    onActionClick,
    hasWindow = true,
  } = opts;

  // Records every write to `window.location.href`.
  const navigations: string[] = [];
  const noticeState = 'past_due';

  function handleAction(): void {
    if (onActionClick) {
      onActionClick(noticeState);
      return;
    }
    // Default: open the app's billing surface. Destination priority:
    // `actionHref` prop → `billing.manageRoute` config → '/billing'.
    if (hasWindow) {
      let manageRoute: string | undefined;
      try {
        manageRoute = getConfig().billing?.manageRoute;
      } catch {
        // Config not initialized — fall through to the default.
      }
      navigations.push(actionHref ?? manageRoute ?? '/billing');
    }
  }

  return { handleAction, navigations, noticeState };
}

// ── Replica: BridgeQuotaBanner.svelte handleAction() ─────────────────────────

interface QuotaHarnessOptions extends NoticeHarnessOptions {
  /**
   * The quota banner bails out entirely when the snapshot is missing. Pass
   * `null` to model that; omit it for the normal hydrated case. (`null` rather
   * than `undefined` so a destructuring default can't quietly re-fill it.)
   */
  snapshot?: { metric: string } | null;
}

function makeQuotaHarness(opts: QuotaHarnessOptions = {}) {
  const {
    getConfig = uninitializedConfig,
    actionHref,
    onActionClick,
    hasWindow = true,
    snapshot = { metric: 'ai_completions' },
  } = opts;

  const navigations: string[] = [];

  function handleAction(): void {
    if (!snapshot) return;
    if (onActionClick) {
      onActionClick(snapshot as never);
      return;
    }
    // Destination priority: `actionHref` prop → `billing.manageRoute` config
    // → '/billing'.
    if (hasWindow) {
      let manageRoute: string | undefined;
      try {
        manageRoute = getConfig().billing?.manageRoute;
      } catch {
        // Config not initialized — fall through to the default.
      }
      navigations.push(actionHref ?? manageRoute ?? '/billing');
    }
  }

  return { handleAction, navigations, snapshot };
}

/** The two harnesses, keyed by component, for the shared-behaviour table. */
const HARNESSES = {
  BridgeBillingNotice: makeNoticeHarness,
  BridgeQuotaBanner: (opts: NoticeHarnessOptions) => makeQuotaHarness(opts),
} satisfies Record<string, (opts: NoticeHarnessOptions) => {
  handleAction: () => void;
  navigations: string[];
}>;

const COMPONENTS = Object.keys(HARNESSES) as (keyof typeof HARNESSES)[];

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Billing CTA manage-route precedence (TBP-451)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe.each(COMPONENTS)('%s', (component) => {
    const harness = HARNESSES[component];

    describe("default — '/billing'", () => {
      it('navigates to /billing when config is uninitialized and no props are given', () => {
        const h = harness({ getConfig: uninitializedConfig });
        h.handleAction();
        expect(h.navigations).toEqual(['/billing']);
      });

      it('navigates to /billing when config is loaded but has no billing block', () => {
        const h = harness({ getConfig: configWithoutBillingBlock });
        h.handleAction();
        expect(h.navigations).toEqual(['/billing']);
      });

      it('navigates to /billing when billing exists but manageRoute is unset', () => {
        const h = harness({ getConfig: () => ({ billing: {} }) });
        h.handleAction();
        expect(h.navigations).toEqual(['/billing']);
      });
    });

    describe('config — billing.manageRoute', () => {
      it('honors the configured manageRoute over the built-in default', () => {
        const h = harness({ getConfig: configWith('/settings/billing') });
        h.handleAction();
        expect(h.navigations).toEqual(['/settings/billing']);
      });

      it('honors an absolute manageRoute URL verbatim', () => {
        const h = harness({ getConfig: configWith('https://billing.example.com/portal') });
        h.handleAction();
        expect(h.navigations).toEqual(['https://billing.example.com/portal']);
      });

      it('reads the config on every click, so a later initConfig is picked up', () => {
        let manageRoute: string | undefined;
        const h = harness({ getConfig: () => ({ billing: { manageRoute } }) });

        h.handleAction(); // config not yet carrying a route
        manageRoute = '/settings/billing';
        h.handleAction(); // same component instance, config now set

        expect(h.navigations).toEqual(['/billing', '/settings/billing']);
      });
    });

    describe('actionHref prop', () => {
      it('overrides the configured manageRoute', () => {
        const h = harness({
          getConfig: configWith('/settings/billing'),
          actionHref: '/team/upgrade',
        });
        h.handleAction();
        expect(h.navigations).toEqual(['/team/upgrade']);
      });

      it('overrides the default when no config is available at all', () => {
        const h = harness({ getConfig: uninitializedConfig, actionHref: '/team/upgrade' });
        h.handleAction();
        expect(h.navigations).toEqual(['/team/upgrade']);
      });
    });

    describe('onActionClick callback (highest precedence)', () => {
      it('wins over both actionHref and config, and performs NO navigation', () => {
        const onActionClick = vi.fn();
        const h = harness({
          getConfig: configWith('/settings/billing'),
          actionHref: '/team/upgrade',
          onActionClick,
        });
        h.handleAction();

        expect(onActionClick).toHaveBeenCalledOnce();
        expect(h.navigations).toEqual([]);
      });

      it('wins even with no other destination configured', () => {
        const onActionClick = vi.fn();
        const h = harness({ getConfig: uninitializedConfig, onActionClick });
        h.handleAction();

        expect(onActionClick).toHaveBeenCalledOnce();
        expect(h.navigations).toEqual([]);
      });

      it('never touches getConfig when the callback short-circuits', () => {
        const getConfig = vi.fn(configWith('/settings/billing'));
        const h = harness({ getConfig, onActionClick: vi.fn() });
        h.handleAction();

        expect(getConfig).not.toHaveBeenCalled();
      });
    });

    describe('SSR guard', () => {
      it('does not navigate when there is no window (typeof window === undefined)', () => {
        const h = harness({ getConfig: configWith('/settings/billing'), hasWindow: false });
        h.handleAction();
        expect(h.navigations).toEqual([]);
      });
    });
  });

  // ── Cross-component agreement ──────────────────────────────────────────────
  //
  // The whole point of S1 is that an app configures `billing.manageRoute` ONCE
  // and both CTAs obey it. This block fails the moment the two handlers drift.

  describe('BridgeBillingNotice and BridgeQuotaBanner resolve identically', () => {
    const cases: { label: string; opts: NoticeHarnessOptions; expected: string[] }[] = [
      {
        label: 'no config, no props → /billing',
        opts: { getConfig: uninitializedConfig },
        expected: ['/billing'],
      },
      {
        label: 'config manageRoute only',
        opts: { getConfig: configWith('/settings/billing') },
        expected: ['/settings/billing'],
      },
      {
        label: 'actionHref beats config',
        opts: { getConfig: configWith('/settings/billing'), actionHref: '/team/upgrade' },
        expected: ['/team/upgrade'],
      },
      {
        label: 'actionHref with no config',
        opts: { getConfig: uninitializedConfig, actionHref: '/team/upgrade' },
        expected: ['/team/upgrade'],
      },
      {
        label: 'no window → no navigation',
        opts: { getConfig: configWith('/settings/billing'), hasWindow: false },
        expected: [],
      },
    ];

    it.each(cases)('$label', ({ opts, expected }) => {
      const notice = makeNoticeHarness(opts);
      const quota = makeQuotaHarness(opts);
      notice.handleAction();
      quota.handleAction();

      expect(notice.navigations).toEqual(expected);
      expect(quota.navigations).toEqual(expected);
      expect(quota.navigations).toEqual(notice.navigations);
    });

    it('onActionClick suppresses navigation in both components', () => {
      const noticeCb = vi.fn();
      const quotaCb = vi.fn();
      const shared = { getConfig: configWith('/settings/billing'), actionHref: '/team/upgrade' };

      const notice = makeNoticeHarness({ ...shared, onActionClick: noticeCb });
      const quota = makeQuotaHarness({ ...shared, onActionClick: quotaCb });
      notice.handleAction();
      quota.handleAction();

      expect(noticeCb).toHaveBeenCalledOnce();
      expect(quotaCb).toHaveBeenCalledOnce();
      expect(notice.navigations).toEqual([]);
      expect(quota.navigations).toEqual([]);
    });
  });

  // ── Quota-banner-only guard ────────────────────────────────────────────────

  describe('BridgeQuotaBanner snapshot guard', () => {
    it('does nothing at all — no callback, no navigation — without a snapshot', () => {
      const onActionClick = vi.fn();
      const h = makeQuotaHarness({
        getConfig: configWith('/settings/billing'),
        snapshot: null,
        onActionClick,
      });
      h.handleAction();

      expect(onActionClick).not.toHaveBeenCalled();
      expect(h.navigations).toEqual([]);
    });
  });
});
