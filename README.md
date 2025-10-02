# Bridge Svelte Demo & Library Documentation

This repository contains both Bridge Svelte library and a demo application showcasing its features.

## Quick Links
- [Quickstart Guide](learning/md/quickstart.md) - Get started quickly with Bridge in your Svelte application
- [Examples](learning/md/examples.md) - Detailed examples of Bridge features

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Authentication](#Authentication)
- [Feature Flags](#feature-flags)
- [Demo Application](#demo-application)

## Installation

```bash
npm install @bridge/svelte
```

## Configuration

The Bridge SvelteKit SDK is configured by passing a `BridgeConfig` object to the `bridgeBootstrap` function in your root `+layout.ts` file.

Here's an example:

```typescript
import { bridgeBootstrap, type BridgeConfig } from '@nebulr-group';

export const load = async ({ url }) => {
  const config: BridgeConfig = {
    appId: 'your_app_id',
    callbackUrl: 'http://localhost:5173/auth/oauth-callback',
    defaultRedirectRoute: '/protected',
    debug: true,
  };

  await bridgeBootstrap(url, config);
};
```

### Essential Configuration

These are the primary options you will need to configure for your application.

*   `appId` (**required** `string`): Your unique application identifier from the Bridge dashboard.
*   `callbackUrl` (`string`): The URL that Bridge will redirect to after a user successfully authenticates.
    *   **Default**: `window.location.origin + '/auth/callback'`
*   `defaultRedirectRoute` (`string`): The route to redirect users to after a successful login.
    *   **Default**: `'/'`
*   `debug` (`boolean`): Set to `true` to enable detailed logging from the Bridge SDK to the console.
    *   **Default**: `false`

### Advanced Configuration

These options are typically only needed for development or advanced use cases. In most production scenarios, you can rely on their default values.

*   `authBaseUrl` (`string`): The base URL for the Bridge authentication service.
    *   **Default**: `'https://auth.nblocks.cloud'`
*   `backendlessBaseUrl` (`string`): The base URL for Bridge's backendless services, including feature flags.
    *   **Default**: `'https://backendless.nblocks.cloud'`
*   `loginRoute` (`string`): The route within your application that serves as the login page. The SDK will redirect users here if they attempt to access a protected route without being authenticated.
    *   **Default**: `'/login'`
*   `teamManagementUrl` (`string`): The URL for the Bridge team management portal.
    *   **Default**: `'https://backendless.nblocks.cloud'`

## Authentication

For authentication examples and implementation details, see:
- [Quickstart Guide - authentication](learning/md/quickstart.md#authentication)
- [Examples - authentication](learning/md/examples.md#authentication)

The library provides:
- Login & logout flow
- Protected routes
- Automatic token renewal
- Profile information access

## Feature Flags

For feature flag examples and implementation details, see:
- [Examples - Feature Flags](learning/md/examples.md#feature-flags)

The library supports:
- Basic feature flag usage
- Negation support for inverse conditions
- Cached vs live flag checks
- Route protection with flags
- Server-side feature flags

## Demo Application

The demo application in this repository contains runnable examples of bridge usage patterns found in bridge [examples](learning/md/examples.md) documentation.

To run bridge demo:

```bash
# From bridge project root
bun install
bun run dev
```

The demo showcases:
- Feature flag implementation
- Team management features
- authentication flows
- Integration examples

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

This project is licensed under bridge MIT License - see bridge [LICENSE](LICENSE) file for details.
