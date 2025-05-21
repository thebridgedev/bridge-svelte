<script lang="ts">
  import { auth } from '@nblocks-svelte/shared/services/auth.service'
  import TokenStatus from '../lib/components/TokenStatus.svelte';
  import FeatureFlag from '@nblocks-svelte/client/components/FeatureFlag.svelte';
  const { isAuthenticated } = auth;
</script>

<div class="container">
  <h1>Welcome to nBlocks Demo</h1>
  
  {#if $isAuthenticated}
    <p class="welcome-message">
      You are logged in! Try accessing the protected page or team management.
    </p>
  {:else}
    <p class="welcome-message">
      Please log in to access protected features.
    </p>
  {/if}

  <TokenStatus />

  <div class="features">
    <div class="feature-card">
      <h2>Authentication</h2>
      <p>Secure login and logout functionality with nBlocks</p>
    </div>

    <div class="feature-card">
      <h2>Protected Routes</h2>
      <p>Access control for specific pages</p>
    </div>

    <div class="feature-card">
      <h2>Team Management</h2>
      <p>Manage your team members and permissions</p>
    </div>
  </div>
</div>


<div class="feature-examples">
  <h2 class="heading-lg">Feature Flag Examples</h2>

  <div class="feature-examples-grid">
    <div class="feature-example">
      <h3 class="heading-md">Cached Feature Flag</h3>
      <div class="card">
        <p class="note">Uses cached values (5-minute cache)</p>
        <FeatureFlag flagName="demo-flag" let:enabled>
          {#if enabled}
            <div class="feature-status active">
              <p>Feature flag "demo-flag" is active</p>
            </div>
          {:else}
            <div class="feature-status">Create a feature flag called "demo-flag"</div>
          {/if}
        </FeatureFlag>
      </div>
    </div>

    <div class="feature-example">
      <h3 class="heading-md">Live Feature Flag</h3>
      <div class="card">
        <p class="note">Direct API call on each load</p>
        <FeatureFlag flagName="demo-flag" forceLive={true} let:enabled>
          {#if enabled}
            <div class="feature-status active">
              <p>Feature flag "demo-flag" is active</p>
            </div>
          {:else}
            <div class="feature-status">Create a feature flag called "demo-flag"</div>
          {/if}
        </FeatureFlag>
      </div>
    </div>
  </div>

  <!-- <div class="feature-examples-grid">
    <div class="feature-example">
      <h3 class="heading-md">Client-Side API Feature Flag</h3>
      <div class="card">
        <FeatureFlagAPIExample />
      </div>
    </div>

    <div class="feature-example">
      <h3 class="heading-md">Server-Side Feature Flag</h3>
      <div class="card">
        <p class="mb-4">
          Server-side feature flags are rendered on the server and cannot be directly embedded in client components.
          Click the link below to see the server-side feature flag example:
        </p>
        <button class="nav-link" on:click={handleNavigate}>
          View Server-Side Feature Flag Example
        </button>
      </div>
    </div>
  </div> -->
</div>


<style>
  .container {
    text-align: center;
  }

  h1 {
    font-size: 2.5rem;
    color: #1f2937;
    margin-bottom: 1rem;
  }

  .welcome-message {
    font-size: 1.25rem;
    color: #4b5563;
    margin-bottom: 2rem;
  }

  .features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
    margin-top: 3rem;
  }

  .feature-card {
    background-color: #ffffff;
    padding: 2rem;
    border-radius: 0.5rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: transform 0.2s;
  }

  .feature-card:hover {
    transform: translateY(-4px);
  }

  .feature-card h2 {
    color: #3b82f6;
    margin-bottom: 1rem;
  }

  .feature-card p {
    color: #6b7280;
  }
</style>
