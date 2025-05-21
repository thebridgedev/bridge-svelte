// src/lib/auth.ts
import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { getConfig } from '../../client/stores/config.store';
import type { TokenSet } from './types/config';

const TOKEN_KEY = 'nblocks_tokens';

const tokenStore = writable<TokenSet | null>(null);
const isLoading = writable(true);
const error = writable<string | null>(null);

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
}

function clearTokens() {
  tokenStore.set(null);
  if (browser) localStorage.removeItem(TOKEN_KEY);
}

async function login(options: { redirectUri?: string } = {}) {
  const config = getConfig();
  const redirectUri =
    options.redirectUri ||
    config.callbackUrl ||
    (browser ? window.location.origin + '/auth/callback' : '');

  const loginUrl = `${config.authBaseUrl}/url/login/${config.appId}?redirect_uri=${encodeURIComponent(redirectUri)}`;
  if (browser) {
    window.location.href = loginUrl;
  } else {
    throw new Error('Login not supported in this environment');
  }
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

// --- Derived values

const isAuthenticated = derived(tokenStore, $t => !!$t?.accessToken);

// --- Exports

export const auth = {
  token: tokenStore,
  isAuthenticated,
  isLoading,
  error,
  login,
  logout: clearTokens,
  handleCallback,
  refreshToken,
  getToken: () => get(tokenStore)
};
