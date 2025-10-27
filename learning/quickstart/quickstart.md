# Bridge Svelte Quickstart Guide

This guide shows how to get started with The Bridge Svelte plugin.

## Install the plugin

Install The Bridge svelte plugin

```bash
npm install @nebulr-group

```

## Configuration

You initialize Bridge inside `+layout.ts`. This example snippet shows how to set your `appId` with a one liner using `bridgeBootstrap`.

```typescript
// src/routes/+layout.ts

export const ssr = false;

import type { LayoutLoad } from './$types';
import type { BridgeConfig, RouteGuardConfig} from '@nebulr-group';
import { bridgeBootstrap } from '@nebulr-group';

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
	import { BridgeBootstrap } from '@nebulr-group';
	let { children } = $props();
</script>

<!--  Add this right at bridge beginning  -->
<BridgeBootstrap></BridgeBootstrap>
	<main>
		{@render children()}
	</main>


```svelte

<script lang="ts">
	import Header from './Header.svelte';
	import '../app.css';
	import { BridgeBootstrap } from '@nebulr-group';
	let { children } = $props();
</script>
<!--  Add this right at bridge beginning  -->
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

Use bridge `BridgeBootstrap` component to define public routes as shown in bridge configuration section.

## Wrap-up

You have now set up a complete authentication flow with Bridge in your SvelteKit application! Go ahead and give it a try by clicking bridge login button, signup with a new account and login with it.

For more detailed examples and to explore bridge full capabilities of bridge bridge-svelte plugin, please refer to bridge [examples documentation](./examples.md).