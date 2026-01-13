// src/lib/shared/services/plan.service.ts
import { browser } from '$app/environment';
import { getConfig } from '../../client/stores/config.store.js';
import { logger } from '../logger.js';
import { auth } from './auth.service.js';

/**
 * Sets the security cookie required for Bridge redirects
 */
async function setSecurityCookie(): Promise<void> {
  if (!browser) {
    throw new Error('Plan redirects are only available in the browser');
  }

  const config = getConfig();
  const cloudViewsUrl = config.cloudViewsUrl;

  if (!cloudViewsUrl) {
    throw new Error('cloudViewsUrl must be configured');
  }

  const tokenSet = auth.getToken();
  const token = tokenSet?.accessToken;

  if (!token) {
    throw new Error('No access token available. Please log in first.');
  }

  try {
    const response = await fetch(`${cloudViewsUrl}/security/setCookie`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to set security cookie: ${response.statusText}`);
    }

    logger.debug('[plan] Security cookie set successfully');
  } catch (error) {
    logger.error('[plan] Failed to set security cookie', error);
    throw error;
  }
}

/**
 * Redirects to Bridge's tenant plan selection page
 * This allows users to view available plans and upgrade/downgrade
 * USES the handover protocol for secure cross-domain authentication
 */
async function redirectToPlanSelection(): Promise<void> {
  if (!browser) {
    throw new Error('Plan redirects are only available in the browser');
  }

  const config = getConfig();
  const authBaseUrl = config.authBaseUrl;
  const cloudViewsUrl = config.cloudViewsUrl;

  try {
    const tokenSet = auth.getToken();
    const accessToken = tokenSet?.accessToken;

    if (!accessToken) {
      throw new Error('No access token available. Please log in first.');
    }

    // 1. Get the handover code from the Auth API
    // We call the auth-api to exchange our access token for a short-lived handover code
    const handoverResponse = await fetch(`${authBaseUrl}/handover/code/${config.appId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ accessToken }),
    });

    if (!handoverResponse.ok) {
      throw new Error(`Failed to get handover code: ${handoverResponse.statusText}`);
    }

    const { code } = await handoverResponse.json();

    if (!code) {
      throw new Error('Handover response did not contain a code');
    }

    // 2. Redirect to the Bridge API entry point which will land us on the plan selection page in cloud-views
    // This entry point will handle the final redirect to the correct cloud-views domain and flow
    const redirectUrl = `${cloudViewsUrl}/subscription-portal/selectPlan?code=${code}`;
    logger.debug('[plan] Redirecting to plan selection via handover', redirectUrl);
    window.location.href = redirectUrl;
  } catch (error) {
    logger.error('[plan] Failed to redirect to plan selection', error);
    throw error;
  }
}

export const planService = {
  redirectToPlanSelection,
  setSecurityCookie
};
