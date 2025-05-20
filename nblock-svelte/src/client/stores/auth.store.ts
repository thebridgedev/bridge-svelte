import { writable } from 'svelte/store';
import { AuthService } from '../../shared/services/auth.service.js';
import type { NblocksConfig } from '../../shared/types/config.js';
import { nblocksConfig } from './config.store.js';

// Create a writable store for auth state
export const authState = writable({
  isAuthenticated: false,
  isLoading: true,
  error: null as string | null
});

const authService = AuthService.getInstance();

// Initialize auth service when config changes
nblocksConfig.subscribe((config: NblocksConfig | null) => {
  if (config) {
    authService.init(config);
  }
});

export async function checkAuth() {
  authState.update(state => ({ ...state, isLoading: true, error: null }));
  
  try {
    const authenticated = await authService.isAuthenticated();
    authState.update(state => ({ ...state, isAuthenticated: authenticated }));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to check authentication status';
    authState.update(state => ({ ...state, error: errorMessage, isAuthenticated: false }));
  } finally {
    authState.update(state => ({ ...state, isLoading: false }));
  }
}

export async function login(options?: { redirectUri?: string }) {
  authState.update(state => ({ ...state, isLoading: true, error: null }));
  
  try {
    await authService.login(options);
    // Note: This will redirect the user, so the code below won't execute
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to login';
    authState.update(state => ({ ...state, error: errorMessage }));
  } finally {
    authState.update(state => ({ ...state, isLoading: false }));
  }
}

export function logout() {
  authState.update(state => ({ ...state, isLoading: true, error: null }));
  
  try {
    authService.logout();
    authState.update(state => ({ ...state, isAuthenticated: false }));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to logout';
    authState.update(state => ({ ...state, error: errorMessage }));
  } finally {
    authState.update(state => ({ ...state, isLoading: false }));
  }
}

export async function handleCallback(code: string) {
  authState.update(state => ({ ...state, isLoading: true, error: null }));
  
  try {
    await authService.handleCallback(code);
    authState.update(state => ({ ...state, isAuthenticated: true }));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to handle callback';
    authState.update(state => ({ ...state, error: errorMessage, isAuthenticated: false }));
  } finally {
    authState.update(state => ({ ...state, isLoading: false }));
  }
} 