import type { NblocksConfig } from '../types/config.js';
import { TokenService } from './token.service.js';

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  idToken: string;
}

export class AuthService {
  private static instance: AuthService;
  private tokenService: TokenService;
  private config: NblocksConfig | null = null;
  private initialized: boolean = false;
  
  private constructor() {
    this.tokenService = TokenService.getInstance();
  }
  
  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }
  
  init(config: NblocksConfig): void {
    this.config = config;
    this.initialized = true;
  }
  
  async login(options: { redirectUri?: string } = {}): Promise<void> {
    if (!this.initialized || !this.config) {
      throw new Error('AuthService has not been properly initialized.');
    }
    
    const redirectUri = options.redirectUri || 
      this.config.callbackUrl || 
      `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`;
    
    const authBaseUrl = this.config.authBaseUrl;
    const loginUrl = `${authBaseUrl}/url/login/${this.config.appId}?redirect_uri=${encodeURIComponent(redirectUri)}`;
    
    if (typeof window !== 'undefined') {
      window.location.href = loginUrl;
    }
  }
  
  async handleCallback(code: string): Promise<void> {
    if (!this.initialized || !this.config) {
      throw new Error('AuthService has not been properly initialized.');
    }
    
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
    if (!this.initialized || !this.config) {
      throw new Error('AuthService has not been properly initialized.');
    }
    
    return await this.tokenService.isAuthenticated();
  }
  
  private async exchangeCode(code: string): Promise<TokenSet> {
    if (!this.initialized || !this.config) {
      throw new Error('AuthService has not been properly initialized.');
    }
    
    const authBaseUrl = this.config.authBaseUrl;
    const url = `${authBaseUrl}/token/code/${this.config.appId}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to exchange code for tokens');
    }
    
    const data = await response.json();
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      idToken: data.id_token
    };
  }
  
  async refreshToken(refreshToken: string): Promise<TokenSet | null> {
    if (!this.initialized || !this.config) {
      throw new Error('AuthService has not been properly initialized.');
    }
    
    if (!refreshToken) {
      if (this.config.debug) {
        console.log('AuthService - No refresh token provided');
      }
      return null;
    }
    
    try {
      const authBaseUrl = this.config.authBaseUrl;
      const url = `${authBaseUrl}/token`;
      
      if (this.config.debug) {
        console.log("🔄 AuthService - Refreshing token:", url);
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: this.config.appId,
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        }),
      });
      
      if (!response.ok) {
        if (this.config.debug) {
          console.error('AuthService - Failed to refresh token:', await response.text());
        }
        return null;
      }
      
      const data = await response.json();
      
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        idToken: data.id_token
      };
    } catch (error) {
      if (this.config.debug) {
        console.error('AuthService - Error refreshing token:', error);
      }
      return null;
    }
  }
} 