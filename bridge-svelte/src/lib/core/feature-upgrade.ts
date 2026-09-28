/**
 * TBP-756 — "this feature is not on your plan", as an event the upgrade dialog
 * listens to.
 *
 * Owner decision (2026-09-28): nothing opens by itself. The upgrade dialog's
 * feature variant opens only when the person does something gated:
 *   - reaches a route whose feature flag is off because of the plan (the route
 *     guard), on first load after redirecting to the rule's `redirectTo`;
 *   - clicks the upgrade prompt a `<FeatureFlag>` shows (its `fallback`
 *     snippet's `openUpgrade`, or the opt-in `upgrade` prompt);
 *   - makes a request the backend refuses with `402 FEATURE_NOT_IN_PLAN`
 *     (bridge-nestjs's flag guards), like the `402 QUOTA_EXCEEDED` dialog.
 * A hidden feature with no fallback opens nothing.
 */
import { readable, type Readable } from 'svelte/store';
import { safeFixPath } from './quota-refusal.js';

/** Why a feature is off, as Bridge reports it. */
export type BridgeFeatureOffReason = 'plan' | 'permission' | 'off' | 'rule' | 'rollout';

/** A request to show the upgrade dialog for a feature the plan does not include. */
export interface BridgeFeatureUpgrade {
  /** The feature flag that is off. */
  flag: string | null;
  /**
   * The plan feature the flag's rule asks for (`bridge:billing.entitlement.<feature>`),
   * when it names one. The dialog lists the plans that include it.
   */
  feature: string | null;
  /** Where to upgrade, from a backend refusal's `fix` (a same-app path), else null. */
  fix: string | null;
}

let _current: BridgeFeatureUpgrade | null = null;
let _setCurrent: ((value: BridgeFeatureUpgrade | null) => void) | null = null;

/** The feature upgrade the dialog is showing, or `null`. */
export const featureUpgrade: Readable<BridgeFeatureUpgrade | null> = readable<BridgeFeatureUpgrade | null>(
  null,
  (set) => {
    _setCurrent = set;
    set(_current);
    return () => {
      _setCurrent = null;
    };
  },
);

/**
 * Open the upgrade dialog for a feature the plan does not include. Call it from
 * a click; a page render must never call it (owner rule: nothing opens by itself).
 */
export function openFeatureUpgrade(request: { flag?: string | null; feature?: string | null; fix?: string | null } = {}): void {
  _current = {
    flag: request.flag ?? null,
    feature: request.feature ?? null,
    fix: safeFixPath(request.fix),
  };
  _setCurrent?.(_current);
}

/** Close the feature variant of the upgrade dialog. */
export function dismissFeatureUpgrade(): void {
  _current = null;
  _setCurrent?.(null);
}

/**
 * The upgrade request in a `402 FEATURE_NOT_IN_PLAN` body (bridge-nestjs), or
 * null when the body is something else.
 */
export function parseFeatureRefusal(body: unknown): BridgeFeatureUpgrade | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b.code !== 'FEATURE_NOT_IN_PLAN') return null;
  return {
    flag: typeof b.flag === 'string' && b.flag ? b.flag : null,
    feature: typeof b.feature === 'string' && b.feature ? b.feature : null,
    fix: safeFixPath(b.fix),
  };
}

/** Test-only: forget the current request. */
export function __resetFeatureUpgradeForTests(): void {
  dismissFeatureUpgrade();
}
