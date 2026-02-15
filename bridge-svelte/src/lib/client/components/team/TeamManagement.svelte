<script lang="ts">
  import { onMount } from 'svelte';
  import { logger } from '../../../shared/logger.js';
  import { auth } from '../../../shared/services/auth.service.js';
  import { getConfig } from '../../stores/config.store.js';

  let iframeUrl = $state<string | null>(null);
  let error = $state<string | null>(null);
  let isLoading = $state(true);

  async function getHandoverCode(accessToken: string) {
    const config = getConfig();
    const authBaseUrl = config.authBaseUrl;
    const appId = config.appId;

    logger.debug('[TeamManagement] getHandoverCode called', { authBaseUrl, appId });

    const response = await fetch(
      `${authBaseUrl}/handover/code/${appId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          accessToken,
          redirectUri: config.callbackUrl || `${window.location.origin}/auth/oauth-callback`
        }),
      }
    );

    logger.debug('[TeamManagement] handover response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[TeamManagement] Failed to get handover code: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Failed to get handover code: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    logger.debug('[TeamManagement] handover response data:', data);
    
    if (!data.code) {
      logger.error('[TeamManagement] No handover code in response:', data);
      throw new Error('Failed to get handover code: No code in response');
    }

    // Use the teamManagementUrl which points to bridge-api's user-management-portal endpoint
    // bridge-api handles the redirect to cloud-views with proper handover
    const baseUrl = config.teamManagementUrl;
    const url = `${baseUrl}?code=${data.code}`;
    logger.debug('[TeamManagement] constructed iframe URL:', url);
    return url;
  }

  onMount(async () => {
    logger.debug('[TeamManagement] onMount started');
    try {
      // Get token directly - auth.getToken() returns the current token synchronously
      const token = auth.getToken();
      logger.debug('[TeamManagement] token check:', { hasToken: !!token, hasAccessToken: !!token?.accessToken });
      
      const accessToken = token?.accessToken;
      if (!accessToken) {
        throw new Error('No access token available. Please log in first.');
      }

      iframeUrl = await getHandoverCode(accessToken);
      logger.debug('[TeamManagement] iframe URL set:', iframeUrl);
    } catch (err) {
      logger.error('[TeamManagement] Error:', err);
      error = err instanceof Error ? err.message : 'Failed to load team management';
    } finally {
      isLoading = false;
      logger.debug('[TeamManagement] loading complete, isLoading:', isLoading);
    }
  });
</script>

<div class="team-management-container">
  {#if isLoading}
    <div class="loading">Loading team management...</div>
  {:else if error}
    <div class="error">
      <h3>Error</h3>
      <p>{error}</p>
    </div>
  {:else if iframeUrl}
    <iframe
      src={iframeUrl}
      title="Team Management"
      class="team-management-iframe"
      allow="clipboard-read; clipboard-write"
    ></iframe>
  {/if}
</div>

<style>
  .team-management-container {
    width: 100%;
    height: 100%;
    min-height: 600px;
    position: relative;
  }

  .team-management-iframe {
    width: 100%;
    height: 100%;
    border: none;
    min-height: 600px;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 600px;
    color: #4b5563;
  }

  .error {
    padding: 1rem;
    background-color: #fee2e2;
    border: 1px solid #ef4444;
    border-radius: 0.25rem;
    color: #dc2626;
    margin: 1rem;
  }

  .error h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.125rem;
  }

  .error p {
    margin: 0;
  }
</style> 