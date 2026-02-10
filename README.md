# Bridge Svelte Demo & Library Documentation

[![MadeWithSvelte.com shield](https://madewithsvelte.com/storage/repo-shields/5996-shield.svg)](https://madewithsvelte.com/p/the-bridge/shield-link)

This repository contains both Bridge Svelte library and a demo application showcasing its features.

## Quick Links
- [Quickstart Guide](learning/quickstart/quickstart.md) - Get started quickly with Bridge in your Svelte application
- [Examples](learning/examples/examples.md) - Detailed examples of Bridge features

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Authentication](#Authentication)
- [Feature Flags](#feature-flags)
- [Payments & Subscriptions](#payments--subscriptions)
- [Demo Application](#demo-application)
- [E2E Tests](#e2e-tests-playwright)

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
    *   **Default**: `'https://api.thebridge.dev/auth'`
*   `cloudViewsUrl` (`string`): The base URL for Bridge's cloud-views services, including feature flags.
    *   **Default**: `'https://api.thebridge.dev/cloud-views'`
*   `loginRoute` (`string`): The route within your application that serves as the login page. The SDK will redirect users here if they attempt to access a protected route without being authenticated.
    *   **Default**: `'/login'`
*   `teamManagementUrl` (`string`): The URL for the Bridge team management portal.
    *   **Default**: `'https://api.thebridge.dev/cloud-views/user-management-portal/users'`

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

## Payments & Subscriptions

For payment and subscription management examples and implementation details, see:
- [Examples - Payments & Subscriptions](learning/examples/examples.md#payments--subscriptions)

The library provides:
- Fetching available subscription plans
- Checking current plan status
- Selecting or changing plans (upgrade/downgrade)
- Redirecting to subscription portal for billing management
- Complete plan selection UI examples

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
- Authentication flows
- Payment and subscription management
- Integration examples


## E2E Tests (Playwright)

E2E tests run against the demo app using [Playwright](https://playwright.dev/). The tests verify authentication flows, route protection, feature flags, and team management.

### Prerequisites

- **bridge-api** must be running (tests use its test data API to create test accounts)

### Setup

1. Copy the env template and fill in the API key:

   ```bash
   cp config/.env.test.local.example config/.env.test.local
   ```

2. Set `PLAYWRIGHT_TEST_API_KEY` in `config/.env.test.local` (same key as in bridge-api's config)

That's it. The test app and demo env files are configured automatically.

### Running tests

```bash
# Run all tests against local bridge-api (starts demo app automatically)
bun run test:e2e

# Run a single test file
bun run test:e2e -- e2e/playwright/tests/auth/login-logout.spec.ts

# Run tests matching a name pattern
bun run test:e2e -- --grep "login"

# Run in headed mode (see the browser)
bun run test:e2e:headed

# Run against staging bridge backend
bun run test:e2e:stage

# Run against production bridge backend
bun run test:e2e:prod

# View test report
bun run test:e2e:report
```

Each command automatically:
1. Creates/gets the test app and writes the app ID into the demo env file (pre-setup)
2. Starts the demo app with the correct environment config
3. Runs the tests
4. Stops the demo app

### How it works

- A **pre-setup script** (`e2e/playwright/pre-setup.ts`) creates the test app via bridge-api and writes `VITE_BRIDGE_APP_ID` into the demo env file before Playwright starts
- The demo app is started automatically via Playwright's `webServer` config with the correct Vite mode (`--mode test.local`, `--mode test.stage`, or `--mode test.prod`)
- **Global setup** creates a persistent test app (`BRIDGE_SVELTE_TEST_DASHBOARD`) via bridge-api — completely separate from the Bridge admin app
- Each test suite creates its own **ephemeral test user** and cleans it up after
- Stale test accounts are purged at the start of each run
- See [bridge-api/docs/tests/PLAYWRIGHT_PATTERNS.md](../bridge-api/docs/tests/PLAYWRIGHT_PATTERNS.md) for testing guidelines

## Publishing & Release

Bridge Svelte is published automatically to **npm** through a GitHub Action workflow.

### 🧩 Releasing a new version

To publish a new package version:

1. **Update** the version field in `bridge-svelte/package.json`
2. **Commit and push** your changes to a feature branch
3. **Create pull request** and merge into `main`
4. **Tag the release** using semantic versioning (`vX.Y.Z`):

   ```bash
   git tag v1.2.3
   git push origin v1.2.3

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

This project is licensed under bridge MIT License - see bridge [LICENSE](LICENSE) file for details.
