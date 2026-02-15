import { get, writable } from 'svelte/store';
import { getConfig } from '../client/stores/config.store.js';
import { logger } from './logger.js';
import { auth } from './services/auth.service.js';

const cacheValidityMs = 5 * 60 * 1000;

const cachedFlags = writable<Record<string, boolean>>({});
let lastFetchTime = 0;

  export async function loadFeatureFlags(): Promise<void> {
    const tokens = get(auth.token);
    const appId = tokens?.appId ?? getConfig().appId;
    // We should prefer the token from the store as it is more likely to be up to date
    const accessToken = tokens?.accessToken;
    const cloudViewsUrl = getConfig().cloudViewsUrl;

    if (!appId) return;

    // Log the token we are using to fetch flags (partial for security)
    logger.debug(`[feature-flag] fetching flags with token: ${accessToken ? accessToken.substring(0, 10) + '...' : 'none'}`);

    const url = `${cloudViewsUrl}/flags/bulkEvaluate/${appId}`;
  const body = accessToken ? { accessToken } : {};

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error('Failed to load feature flags');

  const data = await res.json();
  const flags = data.flags.reduce((acc: Record<string, boolean>, { flag, evaluation }: { flag: string; evaluation?: { enabled: boolean } }) => {
    acc[flag] = evaluation?.enabled ?? false;
    return acc;
  }, {});

  cachedFlags.set(flags);
  lastFetchTime = Date.now();
}

export async function isFeatureEnabled(flag: string, forceLive = false): Promise<boolean> {
  const tokens = get(auth.token);
  const appId = tokens?.appId ?? getConfig().appId;
  const accessToken = tokens?.accessToken;
  const cloudViewsUrl = getConfig().cloudViewsUrl;
  

  if (!appId) return false;
  logger.debug(`[feature-flag] is flag:${flag}: enabled: ${get(cachedFlags)[flag]}` );
  if (!forceLive && Date.now() - lastFetchTime < cacheValidityMs) {
    return get(cachedFlags)[flag] ?? false;
  }

  if (!forceLive) await loadFeatureFlags();

  if (forceLive) {
    const url = `${cloudViewsUrl}/flags/evaluate/${appId}/${flag}`;
    const body = accessToken ? { accessToken } : {};

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) return get(cachedFlags)[flag] ?? false;
    const { enabled } = await res.json();
    cachedFlags.update(f => ({ ...f, [flag]: enabled }));
    return enabled ?? false;
  }

  return get(cachedFlags)[flag] ?? false;
}

export const featureFlags = {
  flags: cachedFlags,
  refresh: loadFeatureFlags
};
