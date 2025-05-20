import { getConfig } from '../../client/stores/config.store';
import type { NblocksConfig } from '../types/config.ts';
import type { TokenService } from './token.service.js';

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  idToken: string;
}

export class AuthService {
  private static instance: AuthService;
  private tokenService: TokenService;

  private constructor() {
    this.tokenService = TokenService.getInstance();
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private get config(): NblocksConfig {
    return getConfig(); // Will throw if config is not initialized
  }

  async login(options: { redirectUri?: string } = {}): Promise<void> {
    const config = this.config;

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

  async handleCallback(code: string): Promise<void> {
    const config = this.config;

    if (!code) {
      throw new Error('No authorization code provided');
    }

    const tokens = await this.exchangeCode(code);
    this.tokenService.setTokens(tokens);
  }

  logout(): void {
    this.tokenService.clearTokens();
  }

  async isAuthenticated(): Promise<boolean> {
    return await this.tokenService.isAuthenticated();
  }

  private async exchangeCode(code: string): Promise<TokenSet> {
    const config = this.config;
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

  async refreshToken(refreshToken: string): Promise<TokenSet | null> {
    const config = this.config;

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

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        idToken: data.id_token,
      };
    } catch (error) {
      if (config.debug) {
        console.error('AuthService - Error refreshing token:', error);
      }
      return null;
    }
  }
}
