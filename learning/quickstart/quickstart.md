# Bridge Svelte Quickstart Guide

This guide shows how to get started with The Bridge Svelte plugin.

## Install the plugin

Install The Bridge svelte plugin

```bash
npm i @nebulr-group/bridge-svelte

```

## Configuration

You initialize Bridge inside `+layout.ts`. This example snippet shows how to set your `appId` with a one liner using `bridgeBootstrap`.

```typescript
// src/routes/+layout.ts

export const ssr = false;

import type { LayoutLoad } from './$types';
import type { BridgeConfig, RouteGuardConfig} from '@nebulr-group/bridge-svelte';
import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';

export const load: LayoutLoad = async ({ url }) => {  

  //Initialize  the bridge
  await bridgeBootstrap(url, "YOUR_APP_ID");

}

```

You also initialize `BridgeBootstrap` inside `+layout.svelte` with a one liner.  
<br/>
You are all done and your app is protected. 

```svelte
<!--src/routes/+layout.svelte!-->

<script lang="ts">  
	import Header from './Header.svelte';
	import '../app.css';
	import { BridgeBootstrap } from '@nebulr-group/bridge-svelte';
	let { children } = $props();
</script>

<!--  Add this right at the beginning  -->
<BridgeBootstrap></BridgeBootstrap>
	<main>
		{@render children()}
	</main>
```

## authentication

### Redirecting to Bridge login

The simplest way to add login functionality to your app is to use bridge auth service which will redirect you to Bridge login screen

```ts
<!-- src/components/LoginButton.svelte -->
<script lang="ts">
  import { auth } from '@nebulr-group/bridge-svelte';
  const { login } = auth;
</script>

<button onclick={() => login()}>
  Sign In
</button>

```

## Handling the OAuth callback

`/auth/oauth-callback` should be marked public in your `routeConfig`. The callback is handled inside `bridgeBootstrap`; you do not need a separate page for it. 

## Protecting Routes

Pass a `routeConfig` to `bridgeBootstrap` in `+layout.ts` to define public and protected routes. See the [examples](../examples/examples.md#route-protection) for full route protection and feature-flag gating.

## Wrap-up

You have now set up a complete authentication flow with Bridge in your SvelteKit application! Go ahead and give it a try by clicking the Bridge login button, signing up with a new account, and logging in.

For more detailed examples and to explore bridge full capabilities of bridge bridge-svelte plugin, please refer to the [examples documentation](../examples/examples.md).