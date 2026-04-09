// src/lib/auth/profile.ts — thin wrapper delegating to bridge-instance
import { get } from 'svelte/store';
import {
  getBridgeAuth,
  profileStore as _profileReadable,
  _profileWritable,
  _errorWritable,
  isOnboarded,
  hasMultiTenantAccess,
} from '../core/bridge-instance.js';

// Re-export types from auth-core
export type { IDToken, Profile } from '@nebulr-group/bridge-auth-core';

export const profileStore = {
  /** User profile (undefined = loading, null = no profile, Profile = loaded) */
  profile: _profileReadable,

  /** Last profile error */
  error: _errorWritable as typeof _errorWritable,

  /** Whether user has completed onboarding */
  isOnboarded,

  /** Whether user has access to multiple tenants */
  hasMultiTenantAccess,

  /** Refresh profile from auth-core */
  updateProfile: async () => {
    const profile = await getBridgeAuth().getProfile();
    _profileWritable.set(profile ?? null);
  },

  /** Synchronous access to current profile */
  getProfile: () => get(_profileReadable) ?? null,

  /** Clear profile */
  clear: () => {
    _profileWritable.set(null);
    _errorWritable.set(null);
  },
};
