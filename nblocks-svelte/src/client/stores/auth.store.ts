import { writable } from 'svelte/store';
import * as auth from '../../shared/services/auth.service.js'; // 👈 new functional service

export const authState = writable({
  isAuthenticated: false,
  isLoading: true,
  error: null as string | null
});

export async function checkAuth() {
  authState.update(state => ({ ...state, isLoading: true, error: null }));

  try {
    const authenticated = auth.isAuthenticated();
    authState.update(state => ({ ...state, isAuthenticated: authenticated }));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to check authentication status';
    authState.update(state => ({ ...state, error: errorMessage, isAuthenticated: false }));
  } finally {
    authState.update(state => ({ ...state, isLoading: false }));
  }
}

export async function login(options?: { redirectUri?: string }) {
  try {
    await auth.login(options);
    // Note: user will be redirected — nothing beyond here will run
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to login';
    authState.update(state => ({ ...state, error: errorMessage }));
  }
}

export function logout() {
  authState.update(state => ({ ...state, isLoading: true, error: null }));

  try {
    auth.logout();
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
    await auth.handleCallback(code);
    authState.update(state => ({ ...state, isAuthenticated: true }));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to handle callback';
    authState.update(state => ({ ...state, error: errorMessage, isAuthenticated: false }));
  } finally {
    authState.update(state => ({ ...state, isLoading: false }));
  }
}
