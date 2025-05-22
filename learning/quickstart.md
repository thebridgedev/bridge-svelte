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

After a user logs in through nBlocks, they'll be redirected back to your application. You need to set up a callback route to handle this redirect:

1. First, go to the nBlocks Control Center:
   - Navigate to Authentication -> Authentication -> Security
   - Change the callback URL to point to your application with the path `/auth/oauth-callback`
   - For example: `https://your-app.com/auth/oauth-callback` or `localhost:3000/auth/oauth-callback`
   - **Important**: The path you specify here (`/auth/oauth-callback`) must match exactly where you create your server-side route

2. Now create a server-side route in your Svelte application:
   - The route must be located at the exact path you specified in the control center
   - For the example above, create the file at `app/auth/oauth-callback/+page.svelte`

```ts
<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth } from '@nblocks-svelte/shared/services/auth.service';
  import { onMount } from 'svelte';

  const { handleCallback } = auth;
  onMount(async () => {
    const code = new URLSearchParams(window.location.search).get('code');    
    if (code) {
      try {
        await handleCallback(code);
      } catch (err) {
        console.error('Auth callback error:', err);
      }
    }
    goto('/');
  });
</script> 
```

## Protecting Routes

Use the `NblocksBootStrap` component to define public routes as shown in the configuration section.

You have now set up a complete authentication flow with nBlocks in your SvelteKit application!
Go ahead and give it a try by clicking the login button, signup with a new account and login with it.

For more detailed examples and to explore the full capabilities of the nblocks-svelte plugin, please refer to the [examples documentation](examples.md).

