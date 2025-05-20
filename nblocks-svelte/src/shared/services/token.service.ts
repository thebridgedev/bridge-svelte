import { writable } from 'svelte/store';
import type { TokenSet } from './auth.service.js';

export class TokenService {
  private static instance: TokenService;
  private tokenStore = writable<TokenSet | null>(null);
  
  private constructor() {
    // Initialize from localStorage if available
    if (typeof window !== 'undefined') {
      const storedTokens = localStorage.getItem('nblocks_tokens');
      if (storedTokens) {
        this.tokenStore.set(JSON.parse(storedTokens));
      }
    }
  }
  
  static getInstance(): TokenService {
    if (!TokenService.instance) {
      TokenService.instance = new TokenService();
    }
    return TokenService.instance;
  }
  
  setTokens(tokens: TokenSet): void {
    this.tokenStore.set(tokens);
    if (typeof window !== 'undefined') {
      localStorage.setItem('nblocks_tokens', JSON.stringify(tokens));
    }
  }
  
  clearTokens(): void {
    this.tokenStore.set(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('nblocks_tokens');
    }
  }
  
  async isAuthenticated(): Promise<boolean> {
    let isAuthenticated = false;
    this.tokenStore.subscribe(tokens => {
      isAuthenticated = !!tokens?.accessToken;
    })();
    return isAuthenticated;
  }
  
  getTokens(): TokenSet | null {
    let tokens: TokenSet | null = null;
    this.tokenStore.subscribe(t => {
      tokens = t;
    })();
    return tokens;
  }
  
  subscribe(callback: (tokens: TokenSet | null) => void): () => void {
    return this.tokenStore.subscribe(callback);
  }
} 