<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '../../../shared/services/auth.service';
  import { getConfig } from '../../stores/config.store';

  let iframeUrl: string | null = null;
  let error: string | null = null;
  let isLoading = true;

  async function getHandoverCode(accessToken: string) {
    const config = getConfig();
    const authBaseUrl = config.authBaseUrl;
    const appId = config.appId;

    try {
      const response = await fetch(
        `${authBaseUrl}/handover/code/${appId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ accessToken }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to get handover code: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`Failed to get handover code: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.code) {
        console.error('No handover code in response:', data);
        throw new Error('Failed to get handover code: No code in response');
      }

      // Create the team management URL with the handover code
      const baseUrl = config.teamManagementUrl;
      return `${baseUrl}?code=${data.code}`;
    } catch (err) {
      console.error('Error getting handover code:', err);
      throw err;
    }
  }

  onMount(async () => {
    console.log('TeamManagement onMount');
    try {
      if (!auth.isAuthenticated) {
        console.log('TeamManagement onMount: User is not authenticated');
        throw new Error('User must be authenticated to access team management');
      }
      const token = auth.getToken();
      // Get the access token from your auth store
      const accessToken = token.accessToken;
      if (!accessToken) {
        throw new Error('No access token available');
      }

      iframeUrl = await getHandoverCode(accessToken);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load team management';
    } finally {
      isLoading = false;
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