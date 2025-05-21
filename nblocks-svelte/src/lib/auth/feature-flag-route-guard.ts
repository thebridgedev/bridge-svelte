import { isFeatureEnabled } from '../../shared/feature-flag';

export interface FeatureFlagProtection {
  flag: string;
  paths: (string | RegExp)[];
  redirectTo: string;
}

export async function checkFeatureFlagProtection(
  path: string,
  protections: FeatureFlagProtection[]
): Promise<string | null> {
  for (const protection of protections) {
    console.log('protection', protection);
    if (protection.paths.some(p => new RegExp(p).test(path))) {
      const enabled = await isFeatureEnabled(protection.flag);
      if (!enabled) {
        return protection.redirectTo;
      }
    }
  }
  return null;
}
