// src/lib/auth.ts
import { browser } from '$app/environment';
import { derived, get, writable } from 'svelte/store';
import { getConfig } from '../../client/stores/config.store';
import type { TokenSet } from './types/config';

const TOKEN_KEY = 'nblocks_tokens';

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
    console.error('Failed to load tokens from storage', e);
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

  const redirectUri =
    options.redirectUri ||
    config.callbackUrl ||
    (browser ? window.location.origin + '/auth/callback' : '');
  return `${config.authBaseUrl}/url/login/${config.appId}?redirect_uri=${encodeURIComponent(redirectUri)}`;
}

async function handleCallback(code: string) {
  const config = getConfig();
  const url = `${config.authBaseUrl}/token/code/${config.appId}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });

  if (!response.ok) throw new Error('Failed to exchange code for tokens');
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
    console.error('Failed to refresh token', e);
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

function scheduleTokenRefresh() {
  if (!browser) return;
  const current = get(tokenStore);
  const exp = current?.accessToken ? getTokenExpiry(current.accessToken) : null;
  if (!exp) return;

  const timeUntilExpiry = exp - Date.now();
  console.log('timeUntilExpiry and refresh threshold', timeUntilExpiry, REFRESH_THRESHOLD_MS);
  
  if (timeUntilExpiry <= REFRESH_THRESHOLD_MS) {
    console.log('refreshing now');
    // refreshNow();
  } else {
    const checkIn = Math.max(timeUntilExpiry - REFRESH_THRESHOLD_MS, 10000);
    refreshInterval = setTimeout(refreshNow, checkIn);
  }
}

async function refreshNow() {
  const current = get(tokenStore);
  if (!current?.refreshToken) return;

  console.log('🔄 Attempting token refresh...');

  const newTokens = await refreshToken(current.refreshToken);
  if (newTokens) {
    console.log('✅ Token refreshed');
    setTokens(newTokens);
  } else {
    console.warn('❌ Token refresh failed');
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

if (browser) {
  startAutoRefresh();
}

// --- Derived values ---

const isAuthenticated = derived(tokenStore, $t => !!$t?.accessToken);

// --- Exports ---

export const auth = {
  token: tokenStore,
  isAuthenticated,
  isLoading,
  error,
  login,
  logout: clearTokens,
  handleCallback,
  refreshToken,
  createLoginUrl,
  getToken: () => get(tokenStore)
};
