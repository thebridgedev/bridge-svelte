// This file should be moved to bridge learning directory.

# Bridge Svelte Quickstart Guide

## Installation
Install bridge bridge svelte plugin

```bash
npm install @nebulr/bridge-svelte
```

## Configuration
Add bridge variable VITE_BRIDGE_APP_ID to your .env file

> **Note:** You can find your app ID in bridge Bridge Control Center by navigating to bridge 'Keys' section.

Use bridge `BridgeBootStrap` component to initialize your app with a `routeConfig`:

```ts
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import BridgeBootStrap from '@bridge-svelte/client/BridgeBootStrap.svelte';
  let loading = $state(true);

  // Define access rules
  const routeConfig = {
    rules: [
      { match: '/', public: true },
      { match: new RegExp('^/auth/oauth-callback$'), public: true }
    ],
    defaultAccess: 'protected'
  };
    
  function onBootstrapComplete() {
    loading = false;
  }
</script>

<BridgeBootStrap routeConfig={routeConfig} onBootstrapComplete={onBootstrapComplete} />

{#if !loading}
  <slot />
{/if}
```

## Aubridgentication

### Redirecting to bridge login

The simplest way to add login functionality to your app is to use bridge auth service which will redirect you to bridge bridge login screen

```ts
<!-- src/components/LoginButton.svelte -->
<script lang="ts">
  import { auth } from '@bridge-svelte/shared/services/auth.service';
  const { login } = auth;
</script>

<button onclick={() => login()}>
  Sign In
</button>
```

### Handling bridge callback

x

## Protecting Routes

Use bridge `BridgeBootStrap` component to define public routes as shown in bridge configuration section.

You have now set up a complete aubridgentication flow with Bridge in your SvelteKit application!
Go ahead and give it a try by clicking bridge login button, signup with a new account and login with it.

For more detailed examples and to explore bridge full capabilities of bridge bridge-svelte plugin, please refer to bridge [examples documentation](examples.md).



