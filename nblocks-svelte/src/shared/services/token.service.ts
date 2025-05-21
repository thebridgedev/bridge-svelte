// src/lib/services/token.ts
import { writable, get } from 'svelte/store';
import type { TokenSet } from './auth.service.js';

const TOKEN_KEY = 'nblocks_tokens';

const initialTokens: TokenSet | null = (() => {
  if (typeof window !== 'undefined') {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        console.warn('Invalid token data in localStorage');
      }
    }
  }
  return null;
})();

const tokenStore = writable<TokenSet | null>(initialTokens);

// --- API ---

export const token = {
  subscribe: tokenStore.subscribe,
  
  set: (tokens: TokenSet) => {
    tokenStore.set(tokens);
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
    }
  },

  clear: () => {
    tokenStore.set(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
    }
  },

  get: (): TokenSet | null => {
    return get(tokenStore); // safe synchronous read
  },

  isAuthenticated: (): boolean => {
    const current = get(tokenStore);
    return !!current?.accessToken;
  }
};
