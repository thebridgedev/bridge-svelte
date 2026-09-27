// TBP-703 — which upgrade dialog <BridgeBootstrap> mounts, and where its button
// goes. Kept out of the component so both are plain functions a unit test can
// call with a config.

import type { Component } from 'svelte';
import type { BridgeQuotaRefusal } from '../core/quota-refusal.js';
import type { BridgeConfig, BridgeUpgradeDialogProps } from '../shared/types/config.js';
import { resolveBillingRoutes } from './billing-routes.js';

/**
 * The dialog to mount for a `billing` config: the built-in one (`default`), the
 * app's own component, or none (`false`). Anything that is not `false` and not
 * a component — `true`, `undefined`, a stray string — is the built-in default:
 * the owner decision is that the dialog is on unless turned off.
 */
export function resolveUpgradeDialog(
  billing: BridgeConfig['billing'] | undefined,
): 'default' | Component<BridgeUpgradeDialogProps> | null {
  const setting = billing?.upgradeDialog;
  if (setting === false) return null;
  if (typeof setting === 'function') return setting;
  return 'default';
}

/**
 * Where the upgrade button goes: the refusal's own `fix` path (already limited
 * to a same-app path by `parseQuotaRefusal`), else `billing.manageRoute`
 * (default `/subscription`).
 */
export function upgradeHrefFor(
  refusal: Pick<BridgeQuotaRefusal, 'fix'> | null,
  billing: BridgeConfig['billing'] | undefined,
): string {
  return refusal?.fix ?? resolveBillingRoutes(billing).manageRoute;
}
