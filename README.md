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
npm install @nebulr-group/bridge-svelte
```

## Configuration

The Bridge SvelteKit SDK is configured by passing a `BridgeConfig` object to the `bridgeBootstrap` function in your root `+layout.ts` file.

Here's an example:

```typescript
import { bridgeBootstrap, type BridgeConfig } from '@nebulr-group/bridge-svelte';

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
    *   **Default**: `window.location.origin + '/auth/oauth-callback'`
*   `defaultRedirectRoute` (`string`): The route to redirect users to after a successful login.
    *   **Default**: `'/'`
*   `debug` (`boolean`): Set to `true` to enable detailed logging from the Bridge SDK to the console.
    *   **Default**: `false`

### Advanced Configuration

These options are typically only needed for development or advanced use cases. In most production scenarios, you can rely on their default values.

*   `apiBaseUrl` (`string`): The root URL of the Bridge API. All service URLs are derived from this.
    *   **Default**: `'https://api.thebridge.dev'`
*   `loginRoute` (`string`): The route within your application that serves as the login page. The SDK will redirect users here if they attempt to access a protected route without being authenticated.
    *   **Default**: `'/login'`

## Authentication

Bridge supports **two authentication modes**. Choose the one that fits your needs:

### Option A: OAuth Redirect (Default)

The zero-config approach. Users are redirected to Bridge's hosted login page (cloud-views) and returned via OAuth callback. No custom UI needed.

```svelte
<!-- Just add the Login button — Bridge handles the rest -->
<script>
  import { Login } from '@nebulr-group/bridge-svelte';
</script>

<Login />
```

You also need an OAuth callback page at `/auth/oauth-callback`:

```svelte
<!-- src/routes/auth/oauth-callback/+page.svelte -->
<p>Signing you in...</p>
```

The `bridgeBootstrap()` function in your `+layout.ts` automatically detects the callback and exchanges the code for tokens.

**Best for:** Quick setup, hosted auth page, minimal customization needed.

For more details, see:
- [Quickstart Guide - authentication](learning/quickstart/quickstart.md#authentication)
- [Examples - authentication](learning/examples/examples.md#authentication)

### Option B: SDK Auth (Embedded Components)

Full auth UI runs on **your domain** — no redirects. Users never leave your app. Supports password login, SSO, MFA, passkeys, magic links, signup, and password reset.

```svelte
<script>
  import { LoginForm } from '@nebulr-group/bridge-svelte';
</script>

<LoginForm
  showSignupLink
  signupHref="/signup"
  onLogin={() => goto('/dashboard')}
/>
```

`<LoginForm />` is a compound component that handles the entire flow: email → password → MFA → tenant selection. It uses the `authState` store internally, so transitions happen automatically.

You can also use individual components for custom flows:

```svelte
<script>
  import {
    MfaChallenge,
    MfaSetup,
    TenantSelector,
    SsoButton,
    SignupForm,
    ForgotPassword,
    MagicLink,
    PasskeyLogin,
    PasskeySetup,
  } from '@nebulr-group/bridge-svelte';
</script>
```

**Best for:** Custom domain, white-label, full UI control, zero redirects.

### SDK Auth Components Reference

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `<LoginForm />` | Full multi-step login | `showSignupLink`, `showForgotPassword`, `showMagicLink`, `showPasskeys`, `ssoMode` (`'redirect'` \| `'popup'`, default `'redirect'`), `onLogin`, `heading` |
| `<SignupForm />` | Registration form | `onSignup`, `showLoginLink`, `loginHref` |
| `<MfaChallenge />` | MFA code entry + recovery | `onVerified`, `showRecoveryOption` |
| `<MfaSetup />` | Phone → verify → backup code | `onComplete` |
| `<TenantSelector />` | Multi-tenant workspace picker | `onSelect`, `tenantItem` (custom render snippet) |
| `<SsoButton />` | Federated login (Google, Azure, etc.) — redirect (default) or popup | `connection`, `label`, `mode` (`'redirect'` \| `'popup'`, default `'redirect'`), `icon` (snippet) |
| `<ForgotPassword />` | Send reset link / set new password | `token` (if present, shows set-password form), `loginHref` |
| `<MagicLink />` | Passwordless email link | `onSent`, `loginHref` |
| `<PasskeyLogin />` | WebAuthn authentication | `onLogin`, `autofill` |
| `<PasskeySetup />` | WebAuthn registration (from email link) | `token`, `onComplete` |

### CSS Theming

All SDK auth components use CSS custom properties with sensible defaults. Override in your global CSS:

```css
:root {
  --bridge-primary: #3b82f6;
  --bridge-primary-hover: #2563eb;
  --bridge-error: #ef4444;
  --bridge-success: #22c55e;
  --bridge-border: #e5e7eb;
  --bridge-text: #1f2937;
  --bridge-text-muted: #6b7280;
  --bridge-bg: #ffffff;
  --bridge-radius: 0.375rem;
  --bridge-font-family: inherit;
}
```

### Comparison

| | OAuth Redirect | SDK Auth |
|---|---|---|
| Login UI | Hosted by Bridge | Your app |
| Redirects | 6+ (OAuth flow) | 0 |
| Custom domain | No | Yes |
| UI customization | Branding only | Full control |
| Setup effort | Minimal | Add components + routes |
| SSO | Full redirect chain | 1 popup |
| MFA | Handled by Bridge | `<MfaChallenge />` / `<MfaSetup />` |

Both modes use the same Bridge API, same tokens, same feature flags, same route guards. You can even use both in the same app (e.g., OAuth redirect for SSR pages, SDK auth for SPA pages).

### Common Features (Both Modes)

- Protected routes with route guards
- Automatic token renewal
- Profile information access (`profileStore`)
- Feature flags
- Team management

## Feature Flags

For feature flag examples and implementation details, see:
- [Examples - Feature Flags](learning/examples/examples.md#feature-flags)

The library supports:
- Basic feature flag usage
- Negation support for inverse conditions
- Cached vs live flag checks
- Route protection with flags
- Server-side feature flags

## Payments & Subscriptions

For full examples and API reference, see:
- [Payments & Subscriptions — examples guide](learning/examples/examples.md#payments--subscriptions)

**Quick start:**

```svelte
<script lang="ts">
  import { PlanSelector, loadSubscription } from '@nebulr-group/bridge-svelte';
  import { onMount } from 'svelte';
  onMount(() => loadSubscription());
</script>

<PlanSelector
  successUrl="https://yourapp.com/subscription/success"
  cancelUrl="https://yourapp.com/subscription/cancel"
/>
```

The library provides:
- `<PlanSelector>` — drop-in headless component that renders plan cards and drives the full checkout flow
- `subscriptionStore` — reactive Svelte store with `status`, `plans`, `loading`, `error`
- `loadSubscription()` — fetches status + plans in parallel and populates the store
- `planService` methods for custom UIs: `getPlans`, `getSubscriptionStatus`, `selectFreePlan`, `startCheckout`, `changePlan`, `getPortalUrl`
- Stripe Checkout integration via lazy-loaded `@stripe/stripe-js` (install separately, only needed for paid plans)

## Demo Application

The demo application in this repository contains runnable examples of Bridge usage patterns found in the [examples](learning/examples/examples.md) documentation.

To run bridge demo:

```bash
# From bridge project root
bun install
bun run dev
```

The demo showcases:
- **OAuth Redirect auth** — "Login with Bridge" button in the nav (redirects to hosted page)
- **SDK Auth** — `/sdk-auth/*` pages with embedded `<LoginForm />`, `<SignupForm />`, etc. (no redirects)
- Feature flag implementation
- Team management features
- Payment and subscription management


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

### Manual test app setup

The pre-setup script creates the test app automatically, but you can also set up the dedicated SDK test app manually via the bridge-api endpoint (idempotent — safe to run repeatedly):

```bash
curl -X POST http://localhost:3200/v1/account/test/playwright/setup-sdk-app \
  -H "Content-Type: application/json" \
  -H "x-playwright-api-key: $PLAYWRIGHT_TEST_API_KEY"
```

This creates a fixed SDK app with a stable app ID that you can hardcode in `demo/.env.test.local`:

```bash
VITE_BRIDGE_APP_ID=69b2b2e2d4171d4fcdc7ef25
```

See bridge-api's README → "SDK App Setup" for full details.

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
   ```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
