import { writable, get } from 'svelte/store';
import { auth } from './services/auth.service';
import { getConfig } from '../client/stores/config.store';

const baseUrl = 'https://backendless.nblocks.cloud';
const cacheValidityMs = 5 * 60 * 1000;

const cachedFlags = writable<Record<string, boolean>>({});
let lastFetchTime = 0;

export async function loadFeatureFlags(): Promise<void> {
  const tokens = get(auth.token);
  const appId = tokens?.appId ?? getConfig().appId;
  const accessToken = tokens?.accessToken;

  if (!accessToken || !appId) return;

  const url = `${baseUrl}/flags/bulkEvaluate/${appId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken })
  });

  if (!res.ok) throw new Error('Failed to load feature flags');

  const data = await res.json();
  const flags = data.flags.reduce((acc, { flag, evaluation }) => {
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

  if (!accessToken || !appId) return false;

  if (!forceLive && Date.now() - lastFetchTime < cacheValidityMs) {
    return get(cachedFlags)[flag] ?? false;
  }

  if (!forceLive) await loadFeatureFlags();

  if (forceLive) {
    const url = `${baseUrl}/flags/evaluate/${appId}/${flag}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken })
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
