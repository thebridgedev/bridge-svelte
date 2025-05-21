<script lang="ts">
	import TokenStatus from '$lib/components/TokenStatus.svelte';
  import FeatureFlag from '@nblocks-svelte/client/components/FeatureFlag.svelte';
  import { auth } from '@nblocks-svelte/shared/services/auth.service';
  import ConfigStatus from '$lib/components/ConfigStatus.svelte';
    // import FeatureFlagAPIExample from '../lib/components/FeatureFlagAPIExample.svelte';
  const { isAuthenticated } = auth;
</script>

<div class="page-container">
  <div class="container">
    <div class="content">
      <div class="hero">
        <h1 class="heading-xl">Welcome to the nBlocks Svelte Demo</h1>
        <p class="text-lead">
          This demo showcases the integration of nBlocks features in a Svelte application.
        </p>
      </div>

      <ConfigStatus />
      <div class="features-overview">
        <h2 class="heading-lg">The code demonstrates the following features</h2>
        <div class="features-grid">
          <div class="feature-group">
            <h3 class="heading-md">🚦 Feature Flags</h3>
            <ul>
              <li>Basic feature flag usage</li>
              <li>Negation support for inverse conditions</li>
              <li>Cached vs live flag checks</li>
              <li>Route protection with flags</li>
            </ul>
          </div>

          <div class="feature-group">
            <h3 class="heading-md">👥 Team Management</h3>
            <ul>
              <li>Team members overview</li>
              <li>Role management</li>
              <li>Invite system</li>
              <li>Permissions handling</li>
            </ul>
          </div>

          <div class="feature-group">
            <h3 class="heading-md">🔐 Authentication</h3>
            <ul>
              <li>Login & logout flow</li>
              <li>Protected routes</li>
              <li>Automatic token renewal</li>
              <li>Profile information</li>
            </ul>
          </div>

          <div class="feature-group">
            <h3 class="heading-md">🛠️ Integration Examples</h3>
            <ul>
              <li>Conditional rendering</li>
              <li>Route guards</li>
              <li>State management</li>
              <li>Error handling</li>
            </ul>
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

        <div class="feature-examples-grid">
          <!-- <div class="feature-example">
            <h3 class="heading-md">Client-Side API Feature Flag</h3>
            <div class="card">
              <FeatureFlagAPIExample />
            </div>
          </div> -->

          <!-- <div class="feature-example">
            <h3 class="heading-md">Server-Side Feature Flag</h3>
            <div class="card">
              <p class="mb-4">
                Server-side feature flags are rendered on the server and cannot be directly embedded in client components.
                Click the link below to see the server-side feature flag example:
              </p>
              <a href="/server-feature-flag-example" class="nav-link">
                View Server-Side Feature Flag Example
              </a>
            </div>
          </div> -->
        </div>
      </div>      
    </div>
  </div>
</div>

