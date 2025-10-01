# Bridge Svelte Quickstart Guide

This guide shows how to get started with The Bridge Svelte plugin.

## Installation

Install bridge bridge svelte plugin

```bash
npm install @nebulr/bridge-svelte

```

## Configuration

You initialize Bridge inside `+layout.svelte`. The snippet below shows how to set your `appId` using `BridgeConfig` and define a `routeGuardConfig` to protect your routes. For this example, we will protect all routes.

Finally, you initialize bridge configs using `bridgeBootstrap`.

```typescript
// src/routes/+layout.ts

export const ssr = false;

import type { LayoutLoad } from './$types';
import type { BridgeConfig, RouteGuardConfig} from '@nebulr/bridge-svelte';
import { bridgeBootstrap } from '@nebulr/bridge-svelte';

export const load: LayoutLoad = async ({ url }) => {  

  //Initialize bridge bridge
  await bridgeBootstrap(url, "YOUR_APP_ID");

}

```

Inside your +layout.svelte add BridgeBootstrap

```svelte

<script lang="ts">
	import Header from './Header.svelte';
	import '../app.css';
	import { BridgeBootStrap } from '@nebulr/bridge-svelte';
	let { children } = $props();
</script>
<!--  Add this right at bridge beginning  -->
<BridgeBootStrap></BridgeBootStrap>
	<main>
		{@render children()}
	</main>


```

## Aubridgentication

### Redirecting to Bridge login

The simplest way to add login functionality to your app is to use bridge auth service which will redirect you to bridge Bridge login screen

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

## Handling bridge callback

`/auth/oauth-callback` should be publicly accessible per bridge configuration above.

## Protecting Routes

Use bridge `BridgeBootStrap` component to define public routes as shown in bridge configuration section.

## Wrap-up

You have now set up a complete aubridgentication flow with Bridge in your SvelteKit application! Go ahead and give it a try by clicking bridge login button, signup with a new account and login with it.

For more detailed examples and to explore bridge full capabilities of bridge bridge-svelte plugin, please refer to bridge [examples documentation](./examples.md).