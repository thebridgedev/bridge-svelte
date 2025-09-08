# nBlocks Svelte Examples

Here we are showing the features of the nblocks svelte plugin. 
You can also see these features in our demo application in this monorepo

To start the demo app:
```bash

##from the project root
bun install
bun run dev
```

## Table of Contents
- [Authentication](#authentication)
  - [Renewing User Tokens](#renewing-user-tokens)
  - [Checking Authentication Status](#checking-if-a-user-is-logged-in)
  - [Getting User Profile Information](#getting-user-profile-information)
  - [Route Protection](#route-protection)
- [Feature Flags](#feature-flags)
  - [Bulk Fetching vs Live Updates](#bulk-fetching-vs-live)
  - [Basic Feature Flag Usage](#a-basic-feature-flag)
  - [Live Feature Flag Updates](#live-getting-a-feature-flag)
  - [Conditional Rendering with Feature Flags](#if-else-if-a-featureflag-is-disabled-then-show-this)
  - [Route Protection with Feature Flags](#feature-flags-on-routes)
  - [Server-Side Feature Flags](#feature-flags-on-server-side-code-like-apis)
- [Server-Side Rendering](#server-side-rendering)
- [Configuration](#configuration)
  - [Getting Config Values](#getting-config-values)
  - [Environment Variables](#environment-variables)
  - [Additional Configs](#additional-configs)

## Authentication

### Route Protection

nBlocks can protect routes in your Svelte application:

#### Using NblocksBootStrap

The most comprehensive way to protect routes is using the `NblocksBootStrap` component with a `routeConfig`:

```ts
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import NblocksBootStrap from '@nblocks-svelte/client/NblocksBootStrap.svelte';
  let loading = $state(true);

  const routeConfig = {
    rules: [
      { match: '/', public: true },
      { match: '/login', public: true },
      { match: new RegExp('^/auth/oauth-callback$'), public: true },
      { match: '/beta/*', featureFlag: 'beta-feature', redirectTo: '/' }
    ],
    defaultAccess: 'protected'
  };

  function onBootstrapComplete() {
    loading = false;
  }
</script>

<NblocksBootStrap routeConfig={routeConfig} onBootstrapComplete={onBootstrapComplete} />

{#if !loading}
  <slot />
{/if}
```

This approach:
- **defaultAccess**: sets whether unmatched routes are public or protected
- **rules**: lets you mark individual paths as public and/or gate routes behind feature flags
- Handles redirects automatically


### Renewing User Tokens

nBlocks automatically handles token renewal for you. The token service will refresh tokens before they expire to ensure a seamless user experience.

### Checking if a User is Logged In

You can use the `auth` service to check if a user is currently logged in:

```ts
<!-- src/components/AuthStatus.svelte -->
<script lang="ts">
  import { auth } from '@nblocks-svelte/shared/services/auth.service';
  const { isAuthenticated, isLoading } = auth;
</script>

{#if isLoading}
  <div>Loading...</div>
{:else}
  <div>
    {#if $isAuthenticated}
      You are logged in!
    {:else}
      Please log in to continue
    {/if}
  </div>
{/if}
```

### Getting User Profile Information

Access the current user's profile information using the `auth` service:

```ts
<script lang="ts">
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { auth } from '@nblocks-svelte/shared/services/auth.service';
  import { onMount } from 'svelte';
  import { profileStore } from '@nblocks-svelte/shared/profile';

  const { isAuthenticated } = auth;
  const { profile, error, isOnboarded, hasMultiTenantAccess } = profileStore;

</script>

<div class="container">
  <h1>Profile informatin</h1>
  
  {#if $isAuthenticated}
    <div class="content">
      <p class="message">
        This is a protected page. You can only see this content when you're logged in.
      </p>
      
      <div class="info-card">
        <h2>Authentication Status</h2>
        <p>You are currently authenticated</p>
        <h2>Your Profile</h2>
        <p><strong>Name:</strong> {$profile?.fullName}</p>
        <p><strong>Email:</strong> {$profile?.email}</p>
        <p><strong>Username:</strong> {$profile?.username}</p>
        {#if $profile?.tenant}
          <div style="margin-top: 1rem;">
            <h3>Tenant Information</h3>
            <p><strong>Tenant Name:</strong> {$profile.tenant.name}</p>
            <p><strong>Tenant ID:</strong> {$profile.tenant.id}</p>
          </div>
        {/if}
      </div>
    </div>  
  {/if}
</div>

```

## Feature Flags

### Bulk Fetching vs Live

nBlocks provides two ways to work with feature flags:

1. **Bulk Fetching (Recommended)**: Get all feature flags at once and use them throughout your application. This approach uses a 5-minute cache to improve performance.
2. **Live Updates**: Check feature flags individually with real-time updates, bypassing the cache.

The recommended approach is to use bulk fetching with caching for better performance, simply using the featureflag component will use the cached response :

```ts
<!-- src/components/CachedFeatureExample.svelte -->
<script lang="ts">
  import FeatureFlag from '@nblocks-svelte/client/components/FeatureFlag.svelte';
</script>

<FeatureFlag flagName="demo-flag">  
    <div>Feature flag "demo-flag" is active</div>  
</FeatureFlag>
```

For cases where you need real-time updates, you can use the `forceLive` prop:

```ts
<!-- src/components/LiveFeatureExample.svelte -->
<script lang="ts">
  import FeatureFlag from '@nblocks-svelte/client/components/FeatureFlag.svelte';
</script>

<FeatureFlag flagName="demo-flag" forceLive={true} >  
    <div>Feature flag "demo-flag" is active</div>
</FeatureFlag>
```

### If, else, if a featureflag is disabled then show this

Use the `FeatureFlag` component with let:enabled to show content when a flag is disabled:

```ts
<!-- src/components/ConditionalContent.svelte -->
<script lang="ts">
  import FeatureFlag from '@nblocks-svelte/client/components/FeatureFlag.svelte';
</script>

<FeatureFlag flagName="demo-flag" let:enabled>
    {#if enabled}
        <div class="feature-status active">
        <p>Feature flag "demo-flag" is active</p>
        </div>
    {:else}
        <div class="feature-status"> "demo-flag" is inactive</div>
    {/if}
</FeatureFlag>
```

You can also use the `fallback` prop to provide alternative content:

```ts
<!-- src/components/FeatureWithFallback.svelte -->
<script lang="ts">
  import FeatureFlag from '@nblocks-svelte/client/components/FeatureFlag.svelte';
</script>

```

### Feature flags on routes

Protect entire routes with feature flags using the same `routeConfig` structure:

```ts
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import NblocksBootStrap from '@nblocks-svelte/client/NblocksBootStrap.svelte';
  let loading = $state(true);

  const routeConfig = {
    rules: [
      { match: '/', public: true },
      { match: '/login', public: true },
      { match: new RegExp('^/auth/oauth-callback$'), public: true },
      { match: '/premium/*', featureFlag: 'premium-feature', redirectTo: '/upgrade' },
      { match: '/beta/*', featureFlag: 'beta-feature', redirectTo: '/' }
    ],
    defaultAccess: 'protected'
  };

  function onBootstrapComplete() {
    loading = false;
  }
</script>

<NblocksBootStrap routeConfig={routeConfig} onBootstrapComplete={onBootstrapComplete} />

{#if !loading}
  <slot />
{/if}
```

## Configuration

### Getting Config Values

Access configuration values in your application:

```ts
<!-- src/components/ConfigDisplay.svelte -->
<script lang="ts">
  import { useNblocksConfig } from '@nblocks-svelte/client';
  const config = useNblocksConfig();
</script>

<div>
  <h2>nBlocks Configuration</h2>
  <p>App ID: {config.appId}</p>
  <p>Auth Base URL: {config.authBaseUrl}</p>
  <p>Callback URL: {config.callbackUrl}</p>
</div>
```

### Environment Variables

nBlocks configuration values are primarily set through environment variables in your `.env` file. Here are the available configuration variables:

| Variable Name | Description | Default Value |
|---------------|-------------|---------------|
| `VITE_NBLOCKS_APP_ID` | Your nBlocks application ID | (Required) |
| `VITE_NBLOCKS_AUTH_BASE_URL` | Base URL for nBlocks auth services | `https://auth.nblocks.cloud` |
| `VITE_NBLOCKS_BACKENDLESS_BASE_URL` | Base URL for nBlocks backendless services | `https://backendless.nblocks.cloud` |
| `VITE_NBLOCKS_CALLBACK_URL` | URL for OAuth callback | (Optional) |
| `VITE_NBLOCKS_DEFAULT_REDIRECT_ROUTE` | Default route after login | `/` |
| `VITE_NBLOCKS_LOGIN_ROUTE` | Route for login page | `/login` |
| `VITE_NBLOCKS_DEBUG` | Enable debug mode | `false` |

Example `.env` file:

```env
# Required
VITE_NBLOCKS_APP_ID=your-app-id-here

# Optional (will use defaults if not set)
VITE_NBLOCKS_CALLBACK_URL=/auth/oauth-callback
VITE_NBLOCKS_DEFAULT_REDIRECT_ROUTE=/dashboard
VITE_NBLOCKS_LOGIN_ROUTE=/login
VITE_NBLOCKS_DEBUG=false
```
