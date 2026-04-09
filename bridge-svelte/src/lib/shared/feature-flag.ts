// src/lib/shared/feature-flag.ts — thin wrapper delegating to bridge-instance
import { getBridgeAuth, _flagsWritable, flagsStore } from '../core/bridge-instance.js';

export async function loadFeatureFlags(): Promise<void> {
  const flags = await getBridgeAuth().loadFeatureFlags();
  _flagsWritable.set(flags);
}

export async function isFeatureEnabled(flag: string, forceLive = false): Promise<boolean> {
  return getBridgeAuth().isFeatureEnabled(flag, { forceLive });
}

export const featureFlags = {
  flags: flagsStore,
  refresh: loadFeatureFlags
};
