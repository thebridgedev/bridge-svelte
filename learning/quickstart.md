// This file should be moved to the learning directory.

# nBlocks Svelte Quickstart Guide

## Installation
Install the nblocks svelte plugin

```bash
npm install @nebulr/nblocks-svelte
```

## Configuration
Add the variable VITE_NBLOCKS_APP_ID to your .env file

> **Note:** You can find your app ID in the nBlocks Control Center by navigating to the 'Keys' section.

Use the `NblocksBootStrap` component to initialize your app:

```ts
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import NblocksBootStrap from '@nblocks-svelte/client/NblocksBootStrap.svelte';
  let loading = $state(true);


  //these are the routes that should be accessible withouth authentication
  const PUBLIC_ROUTES = [
      '/',    
    new RegExp('^/auth/oauth-callback$'),    
  ];
    
  function onBootstrapComplete() {
    loading = false;
  }
</script>

<NblocksBootStrap publicRoutes={PUBLIC_ROUTES} onBootstrapComplete={onBootstrapComplete} />

{#if !loading}
  <slot />
{/if}
```

## Authentication

### Redirecting to nblocks login

The simplest way to add login functionality to your app is to use the auth service which will redirect you to the nblocks login screen

```ts
<!-- src/components/LoginButton.svelte -->
<script lang="ts">
  import { auth } from '@nblocks-svelte/shared/services/auth.service';
  const { login } = auth;
</script>

<button onclick={() => login()}>
  Sign In
</button>
```

### Handling the callback

x

## Protecting Routes

Use the `NblocksBootStrap` component to define public routes as shown in the configuration section.

You have now set up a complete authentication flow with nBlocks in your SvelteKit application!
Go ahead and give it a try by clicking the login button, signup with a new account and login with it.

For more detailed examples and to explore the full capabilities of the nblocks-svelte plugin, please refer to the [examples documentation](examples.md).

