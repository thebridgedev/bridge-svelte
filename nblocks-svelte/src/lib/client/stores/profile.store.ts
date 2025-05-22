import { writable } from 'svelte/store';
import type { NblocksConfig } from '../../shared/types/config';
import { nblocksConfig } from './config.store';

export interface Profile {
  username: string;
  email: string;
}

// Create a writable store for profile state
export const profileState = writable({
  profile: null as Profile | null,
  isLoading: true,
  error: null as string | null
});

// Initialize profile when config changes
nblocksConfig.subscribe((config: NblocksConfig | null) => {
  if (config) {
    // TODO: Initialize profile service
  }
});

export async function fetchProfile() {
  profileState.update(state => ({ ...state, isLoading: true, error: null }));
  
  try {
    // TODO: Implement profile fetching
    const profile = null; // Replace with actual profile fetch
    profileState.update(state => ({ ...state, profile }));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to fetch profile';
    profileState.update(state => ({ ...state, error: errorMessage }));
  } finally {
    profileState.update(state => ({ ...state, isLoading: false }));
  }
} 