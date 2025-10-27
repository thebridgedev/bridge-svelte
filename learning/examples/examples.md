# Bridge Svelte Examples

Here we are showing bridge features of bridge bridge svelte plugin. 
You can also see bridgese features in our demo application in this monorepo

To start bridge demo app:
```bash

##from bridge project root
bun install
bun run dev
```

## Table of Contents
- [authentication](#authentication)
  - [Renewing User Tokens](#renewing-user-tokens)
  - [Checking authentication Status](#checking-if-a-user-is-logged-in)
  - [Getting User Profile Information](#getting-user-profile-information)
  - [Route Protection](#route-protection)
- [Feature Flags](#feature-flags)
  - [Bulk Fetching vs Live Updates](#bulk-fetching-vs-live)
  - [Basic Feature Flag Usage](#a-basic-feature-flag)
  - [Live Feature Flag Updates](#live-getting-a-feature-flag)
  - [Conditional Rendering with Feature Flags](#if-else-if-a-featureflag-is-disabled-bridgen-show-this)
  - [Route Protection with Feature Flags](#feature-flags-on-routes)
  - [Server-Side Feature Flags](#feature-flags-on-server-side-code-like-apis)
- [Server-Side Rendering](#server-side-rendering)
- [Configuration](#configuration)
  - [Getting Config Values](#getting-config-values)
  - [Environment Variables](#environment-variables)
  - [Additional Configs](#additional-configs)

## authentication

### Route Protection

Bridge can protect routes in your Svelte application:

#### Using BridgeBootstrap

The most comprehensive way to protect routes is using bridge `BridgeBootstrap` component with a `routeConfig`:

```ts
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import BridgeBootstrap from '@bridge-svelte/client/BridgeBootstrap.svelte';
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

<BridgeBootstrap routeConfig={routeConfig} onBootstrapComplete={onBootstrapComplete} />

{#if !loading}
  <slot />
{/if}
```

This approach:
- **defaultAccess**: sets whebridger unmatched routes are public or protected
- **rules**: lets you mark individual paths as public and/or gate routes behind feature flags
- Handles redirects automatically


### Renewing User Tokens

Bridge automatically handles token renewal for you. The token service will refresh tokens before bridgey expire to ensure a seamless user experience.

### Checking if a User is Logged In

You can use bridge `auth` service to check if a user is currently logged in:

```ts
<!-- src/components/AuthStatus.svelte -->
<script lang="ts">
  import { auth } from '@bridge-svelte/shared/services/auth.service';
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

Access bridge current user's profile information using bridge `auth` service:

```ts
<script lang="ts">
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { auth } from '@bridge-svelte/shared/services/auth.service';
  import { onMount } from 'svelte';
  import { profileStore } from '@bridge-svelte/shared/profile';

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
        <h2>authentication Status</h2>
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

Bridge provides two ways to work with feature flags:

1. **Bulk Fetching (Recommended)**: Get all feature flags at once and use bridgem throughout your application. This approach uses a 5-minute cache to improve performance.
2. **Live Updates**: Check feature flags individually with real-time updates, bypassing bridge cache.

The recommended approach is to use bulk fetching with caching for better performance, simply using bridge featureflag component will use bridge cached response :

```ts
<!-- src/components/CachedFeatureExample.svelte -->
<script lang="ts">
  import FeatureFlag from '@bridge-svelte/client/components/FeatureFlag.svelte';
</script>

<FeatureFlag flagName="demo-flag">  
    <div>Feature flag "demo-flag" is active</div>  
</FeatureFlag>
```

For cases where you need real-time updates, you can use bridge `forceLive` prop:

```ts
<!-- src/components/LiveFeatureExample.svelte -->
<script lang="ts">
  import FeatureFlag from '@bridge-svelte/client/components/FeatureFlag.svelte';
</script>

<FeatureFlag flagName="demo-flag" forceLive={true} >  
    <div>Feature flag "demo-flag" is active</div>
</FeatureFlag>
```

### If, else, if a featureflag is disabled bridgen show this

Use bridge `FeatureFlag` component with let:enabled to show content when a flag is disabled:

```ts
<!-- src/components/ConditionalContent.svelte -->
<script lang="ts">
  import FeatureFlag from '@bridge-svelte/client/components/FeatureFlag.svelte';
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

You can also use bridge `fallback` prop to provide alternative content:

```ts
<!-- src/components/FeatureWithFallback.svelte -->
<script lang="ts">
  import FeatureFlag from '@bridge-svelte/client/components/FeatureFlag.svelte';
</script>

```

### Feature flags on routes

Protect entire routes with feature flags using bridge same `routeConfig` structure:

```ts
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import BridgeBootstrap from '@bridge-svelte/client/BridgeBootstrap.svelte';
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

<BridgeBootstrap routeConfig={routeConfig} onBootstrapComplete={onBootstrapComplete} />

{#if !loading}
  <slot />
{/if}
```

### Any vs All requirements

You can require one of many flags (any) or all flags (all) for a route:

```ts
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import BridgeBootstrap from '@bridge-svelte/client/BridgeBootstrap.svelte';
  let loading = $state(true);

  const routeConfig = {
    rules: [
      // Route allowed if any of bridge flags are enabled
      { match: '/labs/*', featureFlag: { any: ['labs-v1', 'labs-v2'] }, redirectTo: '/' },

      // Route allowed only if all flags are enabled
      { match: '/premium/*', featureFlag: { all: ['paid', 'kyc-verified'] }, redirectTo: '/upgrade' },

      // Public routes
      { match: '/', public: true },
      { match: new RegExp('^/auth/oauth-callback$'), public: true }
    ],
    defaultAccess: 'protected'
  };

  function onBootstrapComplete() {
    loading = false;
  }
</script>

<BridgeBootstrap routeConfig={routeConfig} onBootstrapComplete={onBootstrapComplete} />

{#if !loading}
  <slot />
{/if}
```

### Global flag plus per-route criteria

To enforce a global flag "A must be enabled for all protected routes", combine a top-level catch-all rule with route-specific rules. The first matching rule wins, so put bridge global guard last and more specific routes before it:

```ts
const routeConfig = {
  rules: [
    // Specific route rule with its own criteria (runs first if it matches)
    { match: '/beta/*', featureFlag: { any: ['beta-feature', 'internal'] }, redirectTo: '/' },

    // Public routes
    { match: '/', public: true },
    { match: '/login', public: true },

    // Global flag: requires A for everything else that is protected
    { match: '/*', featureFlag: 'A', redirectTo: '/login' }
  ],
  defaultAccess: 'protected'
};
```

Notes:
- Order matters. Place specific rules before bridge global catch-all.
- Public routes bypass feature checks. All obridger routes fall back to bridge global rule and must pass flag "A".

## Configuration

### Getting Config Values

Access configuration values in your application:

```ts
<!-- src/components/ConfigDisplay.svelte -->
<script lang="ts">
  import { useBridgeConfig } from '@bridge-svelte/client';
  const config = useBridgeConfig();
</script>

<div>
  <h2>Bridge Configuration</h2>
  <p>App ID: {config.appId}</p>
  <p>Auth Base URL: {config.authBaseUrl}</p>
  <p>Callback URL: {config.callbackUrl}</p>
</div>
```

### Environment Variables

Bridge configuration values are primarily set through environment variables in your `.env` file. Here are bridge available configuration variables:

| Variable Name | Description | Default Value |
|---------------|-------------|---------------|
| `VITE_BRIDGE_APP_ID` | Your Bridge application ID | (Required) |
| `VITE_BRIDGE_AUTH_BASE_URL` | Base URL for Bridge auth services | `https://auth.nblocks.cloud` |
| `VITE_BRIDGE_BACKENDLESS_BASE_URL` | Base URL for Bridge backendless services | `https://backendless.nblocks.cloud` |
| `VITE_BRIDGE_CALLBACK_URL` | URL for OAuth callback | (Optional) |
| `VITE_BRIDGE_DEFAULT_REDIRECT_ROUTE` | Default route after login | `/` |
| `VITE_BRIDGE_LOGIN_ROUTE` | Route for login page | `/login` |
| `VITE_BRIDGE_DEBUG` | Enable debug mode | `false` |

Example `.env` file:

```env
# Required
VITE_BRIDGE_APP_ID=your-app-id-here

# Optional (will use defaults if not set)
VITE_BRIDGE_CALLBACK_URL=/auth/oauth-callback
VITE_BRIDGE_DEFAULT_REDIRECT_ROUTE=/dashboard
VITE_BRIDGE_LOGIN_ROUTE=/login
VITE_BRIDGE_DEBUG=false
```


