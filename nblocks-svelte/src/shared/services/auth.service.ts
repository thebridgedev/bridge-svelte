// src/shared/services/auth.service.ts
import { getConfig } from '../../client/stores/config.store';
import type { NblocksConfig } from '../types/config.ts';
import { token } from './token.service.ts';

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  idToken: string;
}

// Private helper to get config safely
function getSafeConfig(): NblocksConfig {
  const config = getConfig();
  if (!config) {
    throw new Error('Auth config is not initialized');
  }
  return config;
}

export async function login(options: { redirectUri?: string } = {}): Promise<void> {
  const config = getSafeConfig();

  const redirectUri =
    options.redirectUri ||
    config.callbackUrl ||
    `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`;

  const loginUrl = `${config.authBaseUrl}/url/login/${config.appId}?redirect_uri=${encodeURIComponent(redirectUri)}`;

  if (config.debug) {
    console.log('🔐 Redirecting to login URL:', loginUrl);
  }

  if (typeof window !== 'undefined') {
    window.location.href = loginUrl;
  } else {
    throw new Error('Login attempted in a non-browser environment.');
  }
}

export async function handleCallback(code: string): Promise<void> {
  if (!code) {
    throw new Error('No authorization code provided');
  }

  const tokens = await exchangeCode(code);
  token.set(tokens);
}

export function logout(): void {
  token.clear();
}

export function isAuthenticated(): boolean {
  return token.isAuthenticated();
}

export function getTokens(): TokenSet | null {
  return token.get();
}

async function exchangeCode(code: string): Promise<TokenSet> {
  const config = getSafeConfig();
  const url = `${config.authBaseUrl}/token/code/${config.appId}`;

  if (config.debug) {
    console.log('🔄 Exchanging code for tokens at:', url);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    throw new Error('Failed to exchange code for tokens');
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    idToken: data.id_token,
  };
}

export async function refreshToken(refreshToken: string): Promise<TokenSet | null> {
  const config = getSafeConfig();

  if (!refreshToken) {
    if (config.debug) {
      console.log('AuthService - No refresh token provided');
    }
    return null;
  }

  try {
    const url = `${config.authBaseUrl}/token`;

    if (config.debug) {
      console.log('🔄 Refreshing token at:', url);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.appId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      if (config.debug) {
        console.error('AuthService - Failed to refresh token:', await response.text());
      }
      return null;
    }

    const data = await response.json();

    const tokens: TokenSet = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      idToken: data.id_token,
    };

    token.set(tokens);
    return tokens;
  } catch (error) {
    if (config.debug) {
      console.error('AuthService - Error refreshing token:', error);
    }
    return null;
  }
}
