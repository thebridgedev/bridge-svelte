// src/lib/auth/profile.ts
import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from 'jose';
import { derived, get, writable } from 'svelte/store';
import { getConfig } from '../client/stores/config.store';
import type { NblocksConfig } from '../types/config';
import { auth } from './services/auth.service.js';

export interface IDToken {
  sub: string;
  preferred_username: string;
  email: string;
  email_verified: boolean;
  name: string;
  family_name?: string;
  given_name?: string;
  locale?: string;
  onboarded?: boolean;
  multi_tenant?: boolean;
  tenant_id?: string;
  tenant_name?: string;
  tenant_locale?: string;
  tenant_logo?: string;
  tenant_onboarded?: boolean;
}

export interface Profile {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
  familyName?: string;
  givenName?: string;
  locale?: string;
  onboarded?: boolean;
  multiTenantAccess?: boolean;
  tenant?: {
    id: string;
    name: string;
    locale?: string;
    logo?: string;
    onboarded?: boolean;
  };
}

const profile = writable<Profile | null | undefined>(undefined);
const error = writable<string | null>(null);

function transformIDToken(payload: IDToken): Profile {
  return {
    id: payload.sub,
    username: payload.preferred_username,
    email: payload.email,
    emailVerified: payload.email_verified,
    fullName: payload.name,
    familyName: payload.family_name,
    givenName: payload.given_name,
    locale: payload.locale,
    onboarded: payload.onboarded,
    multiTenantAccess: payload.multi_tenant,
    tenant: payload.tenant_id
      ? {
          id: payload.tenant_id,
          name: payload.tenant_name || '',
          locale: payload.tenant_locale,
          logo: payload.tenant_logo,
          onboarded: payload.tenant_onboarded,
        }
      : undefined,
  };
}

const config: NblocksConfig = getConfig();
const jwks = createRemoteJWKSet(new URL(`${config.authBaseUrl}/.well-known/jwks.json`));
const expectedIssuer = config.authBaseUrl;
const expectedAudience = config.appId;

async function verifyToken(idToken: string): Promise<Profile | null> {
  try {
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: expectedIssuer,
      audience: expectedAudience,
    });

    return transformIDToken(payload as IDToken);
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      error.set('Token expired');
    } else if (err instanceof joseErrors.JWTInvalid) {
      error.set('Invalid token');
    } else if (err instanceof joseErrors.JWKSNoMatchingKey) {
      error.set('JWKS error');
    } else {
      error.set('Token verification failed');
    }

    profile.set(null);
    return null;
  }
}

async function updateProfile(idToken: string | null) {
  profile.set(undefined);

  if (!idToken) {
    profile.set(null);
    error.set(null);
    return;
  }

  const result = await verifyToken(idToken);
  profile.set(result);
  if (result) error.set(null);
}

// 🔁 Auto-sync profile with token
auth.token.subscribe(($token) => {
  const idToken = $token?.idToken || null;
  updateProfile(idToken);
});

const isOnboarded = derived(profile, ($profile) => $profile?.onboarded ?? false);
const hasMultiTenantAccess = derived(profile, ($profile) => $profile?.multiTenantAccess ?? false);

export const profileStore = {
  profile,
  error,
  updateProfile,
  isOnboarded,
  hasMultiTenantAccess,
  getProfile: () => get(profile),
  clear: () => {
    profile.set(null);
    error.set(null);
  },
};
