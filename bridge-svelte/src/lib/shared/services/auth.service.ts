// src/lib/auth.ts
import { browser } from '$app/environment';
import { derived, get, writable } from 'svelte/store';
import { getConfig } from '../../client/stores/config.store.js';
import { logger } from '../logger.js';
import type { TokenSet } from '../types/config.js';

const TOKEN_KEY = 'bridge_tokens';

const tokenStore = writable<TokenSet | null>(null);
const isLoading = writable(true);
const error = writable<string | null>(null);

let refreshInterval: ReturnType<typeof setTimeout> | null = null;
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// Load from localStorage on first load
if (browser) {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (raw) tokenStore.set(JSON.parse(raw));
  } catch (e) {
    logger.error('Failed to load tokens from storage', e);
  } finally {
    isLoading.set(false);
  }
}

// --- API ---

function setTokens(tokens: TokenSet) {
  tokenStore.set(tokens);
  if (browser) localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  scheduleTokenRefresh();
}

function clearTokens() {
  tokenStore.set(null);
  if (browser) localStorage.removeItem(TOKEN_KEY);
  stopAutoRefresh();
}

async function login(options: { redirectUri?: string } = {}) {
  const loginUrl = createLoginUrl(options);
  if (browser) {
    window.location.href = loginUrl;
  } else {
    throw new Error('Login not supported in this environment');
  }
}

function createLoginUrl(options: { redirectUri?: string } = {}): string {
  const config = getConfig();

  const redirectUri = options.redirectUri ?? config.callbackUrl;
  const base = `${config.authBaseUrl}/url/login/${config.appId}`;
  return redirectUri ? `${base}?redirect_uri=${encodeURIComponent(redirectUri)}` : base;
}

async function handleCallback(code: string) {
  const config = getConfig();
  const url = `${config.authBaseUrl}/token/code/${config.appId}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      ...(config.callbackUrl ? { redirect_uri: config.callbackUrl } : {})
    })
  });

  if (!response.ok) {
    let errorMessage = 'Failed to exchange code for tokens';
    try {
      const errorData = await response.json();
      if (errorData && errorData.message) {
        errorMessage = `Failed to exchange code for tokens: ${errorData.message}`;
      } else if (errorData && typeof errorData === 'string') {
        errorMessage = `Failed to exchange code for tokens: ${errorData}`;
      }
    } catch (e) {
      // If parsing JSON fails, use bridge generic message or response status text
      errorMessage = `Failed to exchange code for tokens: ${response.statusText || 'Unknown error'}`;
    }
    throw new Error(errorMessage);
  }
  const data = await response.json();
  setTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    idToken: data.id_token
  });
}

async function refreshToken(refreshToken: string): Promise<TokenSet | null> {
  const config = getConfig();
  try {
    const url = `${config.authBaseUrl}/token`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.appId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    if (!response.ok) return null;
    const data = await response.json();
    const tokens: TokenSet = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      idToken: data.id_token
    };
    setTokens(tokens);
    return tokens;
  } catch (e) {
    logger.error('Failed to refresh token', e);
    return null;
  }
}

function getTokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    
    return payload.exp * 1000;    
  } catch {
    return null;
  }
}

function shouldRefreshNow(accessToken: string | null): boolean {
  if (!accessToken) return false;
  const exp = getTokenExpiry(accessToken);
  if (!exp) return false;
  const timeUntilExpiry = exp - Date.now();
  return timeUntilExpiry <= REFRESH_THRESHOLD_MS;
}

function scheduleTokenRefresh() {
  if (!browser) return;
  const current = get(tokenStore);
  const accessToken = current?.accessToken ?? null;
  const exp = accessToken ? getTokenExpiry(accessToken) : null;
  if (!exp) return;

  const timeUntilExpiry = exp - Date.now();
  logger.debug('[auth] timeUntilExpiry and refresh threshold', timeUntilExpiry, REFRESH_THRESHOLD_MS);
  
  if (shouldRefreshNow(accessToken)) {
    logger.debug('[auth] refreshing now');
    refreshNow();
  } else {
    const checkIn = Math.max(timeUntilExpiry - REFRESH_THRESHOLD_MS, 10000);
    refreshInterval = setTimeout(refreshNow, checkIn);
  }
}

async function refreshNow() {
  const current = get(tokenStore);
  if (!current?.refreshToken) return;

  logger.debug('🔄 Attempting token refresh...');

  const newTokens = await refreshToken(current.refreshToken);
  if (newTokens) {
    logger.debug('✅ Token refreshed');
    setTokens(newTokens);
  } else {
    logger.warn('❌ Token refresh failed');
    clearTokens();
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  scheduleTokenRefresh();
}

function stopAutoRefresh() {
  if (refreshInterval) clearTimeout(refreshInterval);
  refreshInterval = null;
}

export async function maybeRefreshNow(): Promise<boolean> {
  const current = get(tokenStore);
  const accessToken = current?.accessToken ?? null;
  const refresh = current?.refreshToken ?? null;
  if (!accessToken || !refresh) return !!accessToken;

  if (shouldRefreshNow(accessToken)) {
    const newTokens = await refreshToken(refresh);
    if (newTokens) return true;
    clearTokens();
    return false;
  }
  return true;
}

// --- Derived values ---

const isAubridgenticated = derived(tokenStore, $t => !!$t?.accessToken);

// --- Exports ---

export const auth = {
  token: tokenStore,
  isAubridgenticated,
  isLoading,
  error,
  login,
  logout: clearTokens,
  handleCallback,
  refreshToken,
  createLoginUrl,
  getToken: () => get(tokenStore)
};

export { startAutoRefresh, stopAutoRefresh };
