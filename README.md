# Bridge for SvelteKit

[![MadeWithSvelte.com shield](https://madewithsvelte.com/storage/repo-shields/5996-shield.svg)](https://madewithsvelte.com/p/the-bridge/shield-link)

`@nebulr-group/bridge-svelte` adds Bridge sign-in, workspaces and roles, feature flags, subscriptions and plan limits to a SvelteKit 2 + Svelte 5 app. This repository holds the library (`bridge-svelte/`), a demo app (`demo/`) and the learning docs (`learning/`).

- [How Bridge works](learning/mechanisms.md): the mechanisms and levels every guide builds on
- [Hosted sign-in quickstart](learning/quickstart/hosted-quickstart.md) · [In-app sign-in quickstart](learning/sdk-auth/sdk-quickstart.md)
- [All learning docs](learning/README.md)

## Install

```bash
npm i @nebulr-group/bridge-svelte
```

## The whole integration

One line of `.env` and three files:

```env
# .env
VITE_BRIDGE_APP_ID=your-app-id
# Only for a stage, local or self-hosted app:
# VITE_BRIDGE_API_BASE_URL=https://api-stage.thebridge.dev
```

```ts
// src/routes/+layout.ts
import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';

export const ssr = false;

export const load = bridgeBootstrap({
  rules: [{ match: new RegExp('^/auth($|/)'), public: true }],
});
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { BridgeBootstrap } from '@nebulr-group/bridge-svelte';
  import '@nebulr-group/bridge-svelte/styles';

  let { children } = $props();
</script>

<BridgeBootstrap>
  {@render children()}
</BridgeBootstrap>
```

<<<<<<< HEAD
`<BridgeBootstrap>` renders its children only once Bridge is ready. An option passed to `bridgeBootstrap()` explicitly wins over the environment (`VITE_BRIDGE_APP_ID`, `VITE_BRIDGE_API_BASE_URL`, `VITE_BRIDGE_HOSTED_URL`, `VITE_BRIDGE_DEBUG`), which wins over the default. With no app id anywhere, Bridge refuses to start and names `VITE_BRIDGE_APP_ID`.

### Essential Configuration

These are the primary options you will need to configure for your application.

*   `appId` (**required** `string`): Your unique application identifier from the Bridge dashboard. Read from `VITE_BRIDGE_APP_ID` unless passed.
*   `callbackUrl` (`string`): The URL that Bridge will redirect to after a user successfully authenticates.
    *   **Default**: `window.location.origin + '/auth/oauth-callback'`
*   `defaultRedirectRoute` (`string`): The route to redirect users to after a successful login.
    *   **Default**: `'/'`
*   `debug` (`boolean`): Set to `true` to enable detailed logging from the Bridge SDK to the console.
    *   **Default**: `false`

### Advanced Configuration

These options are typically only needed for development or advanced use cases. In most production scenarios, you can rely on their default values.

*   `apiBaseUrl` (`string`): The root URL of the Bridge API. All service URLs are derived from this. Read from `VITE_BRIDGE_API_BASE_URL` unless passed.
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

You also need a route for the OAuth callback at `/auth/oauth-callback`. One file serves it (and tells anyone landing on `/auth/login` that sign-in is hosted):

```svelte
<!-- src/routes/auth/[...bridge]/+page.svelte -->
<script>
  import { BridgeAuthRoutes } from '@nebulr-group/bridge-svelte';
</script>

<BridgeAuthRoutes />
```

The `bridgeBootstrap()` function in your `+layout.ts` automatically detects the callback and exchanges the code for tokens.

**Best for:** Quick setup, hosted auth page, minimal customization needed.

For more details, see:
- [Quickstart Guide - authentication](learning/quickstart/quickstart.md#authentication)
- [Examples - authentication](learning/examples/examples.md#authentication)

### Option B: SDK Auth (Embedded Components)

Full auth UI runs on **your domain** — no redirects. Users never leave your app. Supports password login, SSO, MFA, passkeys, magic links, signup, and password reset.

Set `loginRoute: '/auth/login'` in `bridgeBootstrap()`, then serve every auth page — login, signup, OAuth callback, set password, forgot password, magic link, passkey setup, workspaces — from one file:

```svelte
<!-- src/routes/auth/[...bridge]/+page.svelte -->
<script>
  import { BridgeAuthRoutes } from '@nebulr-group/bridge-svelte';
</script>

<BridgeAuthRoutes />
```

Restyle with the `frame(page, children)` and `heading(page)` snippets, or take over a single page by creating its file (`src/routes/auth/login/+page.svelte` wins over the catch-all). The components below are what it renders, and what you build a page of your own from:

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
| `<BridgeAuthRoutes />` | Every auth page from one catch-all route | `frame`, `heading` (snippets), `redirectTo`, `messages` |
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

Magic links come back to the page they were requested from, carrying a `bridge_magic_link_token` parameter that `<MagicLink />` and `<LoginForm />` redeem on mount — so keep that route reachable. Pass `sendMagicLink(email, { successUrl })` to send the user elsewhere; the URL must be one of your app's allowed origins. See [Magic link](learning/auth/sign-in/magic-link.md).

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

**Quick start:** one file serves the subscription page, the paywall for workspaces without a plan, and the pages a checkout returns to (`/subscription`, `/subscription/plan`, `/subscription/success`, `/subscription/error`). Bridge's billing redirects and Manage buttons point there by default.

```svelte
<!-- src/routes/subscription/[...bridge]/+page.svelte -->
<script lang="ts">
  import { BridgeBillingRoutes } from '@nebulr-group/bridge-svelte';
</script>

<BridgeBillingRoutes />
```

The library provides:
- `<BridgeBillingRoutes>` — every billing page from one file; `<BridgePaywallPage>` for an onboarding paywall at your own address (e.g. `/welcome`, with `billing.paywallRoute: '/welcome'`)
- `<BillingPortalButton>` — "Manage billing", opens the Stripe billing portal
- `<PlanSelector>` — drop-in headless component that renders plan cards and drives the full checkout flow
- `subscriptionStore` — reactive Svelte store with `status`, `plans`, `loading`, `error`
- `loadSubscription()` — fetches status + plans in parallel and populates the store
- `planService` methods for custom UIs: `getPlans`, `getSubscriptionStatus`, `selectFreePlan`, `startCheckout`, `changePlan`, `getPortalUrl`
- Stripe Checkout integration via lazy-loaded `@stripe/stripe-js` (install separately, only needed for paid plans)
=======
```svelte
<!-- src/routes/auth/[...bridge]/+page.svelte -->
<script lang="ts">
  import { BridgeAuthRoutes } from '@nebulr-group/bridge-svelte';
</script>

<BridgeAuthRoutes />
```

- **Settings are read for you.** `VITE_BRIDGE_APP_ID`, `VITE_BRIDGE_API_BASE_URL`, `VITE_BRIDGE_HOSTED_URL` and `VITE_BRIDGE_DEBUG` are read by the plugin. An option passed to `bridgeBootstrap()` wins over the environment, which wins over the default. With no app id Bridge refuses to start and names the variable. Without an API address it uses production; the hosted login address follows the API address on Bridge's own domains, so only a local or self-hosted Bridge sets `VITE_BRIDGE_HOSTED_URL`.
- **Everything is protected by default**; only `/auth/*` must be public.
- **`<BridgeBootstrap>`** renders the app once Bridge is ready, finishes sign-in callbacks, starts feature flags and live updates, and opens an upgrade dialog when your backend refuses a request at a plan limit.
- **The `[...bridge]` file** serves every sign-in page: login, signup, the OAuth callback, set password (where signup-verification and reset emails land), forgot password, magic link, passkey setup and workspace selection. Any other address under `/auth` gets the app's 404.

### Hosted or in-app sign-in

Without `loginRoute`, sign-in happens on Bridge's hosted page and the `[...bridge]` file only finishes the callback. Add `loginRoute: '/auth/login'` to `bridgeBootstrap()` and the same file renders the sign-in pages inside your app. That one field is the whole switch.

Customise in-app pages by climbing only as far as you need: `--bridge-*` CSS tokens; the `frame(page, children)` and `heading(page)` snippets on `<BridgeAuthRoutes>`; take over one page by creating its route file (`src/routes/auth/login/+page.svelte` wins over the catch-all); or go headless with `getBridgeAuth()`. See [How Bridge works](learning/mechanisms.md) for the rungs and the full token list.

## Subscriptions and plan limits

With plans, one more file serves the subscription page, the paywall and both checkout return pages (`/subscription`, `/subscription/plan`, `/subscription/success`, `/subscription/error`):

```svelte
<!-- src/routes/subscription/[...bridge]/+page.svelte -->
<script lang="ts">
  import { BridgeBillingRoutes } from '@nebulr-group/bridge-svelte';
</script>

<BridgeBillingRoutes />
```

Plan limits are enforced by your backend (with NestJS, one `@RequireQuota` decorator per handler). The frontend has three levels, all optional:

| Level | You write | The user sees |
|---|---|---|
| 0 | nothing | An upgrade dialog when the backend refuses at the limit |
| 1 | `<QuotaGate metric>`, `<Entitled to>` | A button disabled at the cap; a feature shown only on plans that include it |
| 2 | `useQuota(metric)`, `$entitlements.can(key)` | Your own UI from live numbers |

`bridgeFetch()` calls your own backend with the user's token. See [How Bridge works](learning/mechanisms.md) for counter vs gauge, and why browser-reported usage cannot enforce a limit.

## What the package exports

| Area | Components and functions |
|---|---|
| Setup | `bridgeBootstrap`, `BridgeBootstrap`, `bridgeFetch` |
| Sign-in | `BridgeAuthRoutes`, `LoginForm`, `SignupForm`, `ForgotPassword`, `MagicLink`, `PasskeyLogin`, `PasskeySetup`, `PasskeyRequestSetupLink`, `MfaChallenge`, `MfaSetup`, `SsoButton`, `WorkspaceSelector`, `TenantSelector`, `readReturnTo` |
| State | `auth`, `getBridgeAuth`, `isAuthenticated`, `profileStore`, `tokenStore`, `bridge` (app, tenant, user, usage), `entitlements`, `useQuota` |
| Billing | `BridgeBillingRoutes`, `BridgePaywallPage`, `BridgePaywall`, `PlanSelector`, `BillingPortalButton`, `BridgeBillingNotice`, `BridgeSubscriptionStatus`, `BridgeQuotaBanner`, `QuotaGate`, `Entitled`, `BridgeUpgradeDialog`, `onBridgeQuotaExceeded` |
| Teams | `TeamManagementPanel`, `TeamUserList`, `TeamProfileForm`, `TeamWorkspaceForm`, `TeamAddUserDialog`, `TeamEditUserDialog`, `TeamConfirmDialog`, `TeamUserActionsMenu` |
| Developer | `ApiTokenManagement` (a workspace's API tokens), `RealtimeDevBadge`, `realtimeStatus` |
| Flags (`@nebulr-group/bridge-svelte/flags`) | `useFlag`, `FeatureFlag` |

## Guides for coding agents

The same guides agents read are in [`mcp/`](mcp/) and are served by `bridge guide svelte [feature]` and the Bridge MCP server. `bridge guide mechanisms` prints the model they share.
>>>>>>> origin/feature/mcp-journey

## Demo Application

The demo app in `demo/` exercises every feature against a real Bridge app:

```bash
# From the bridge-svelte repo root
bun install
bun run dev
```

It serves the sign-in pages from `src/routes/auth/[...bridge]` (with its own `auth/login` page to prove a page can be taken over), the subscription pages from `src/routes/subscription/[...bridge]`, an opted-in `/welcome` onboarding page, and one page per feature: plan limits, usage, flags, teams, branding, API tokens, SSO, MFA and workspaces.

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
1. Creates/gets the test app via bridge-api (pre-setup)
2. Starts the demo app with the correct environment config
3. Provisions one Bridge app per Playwright worker and seeds each worker's app ID
   into its browser storage state (global-setup)
4. Runs the tests
5. Stops the demo app

No app ID has to be configured by hand for any environment — `demo/.env.test.stage`
and `demo/.env.test.prod` deliberately leave `VITE_BRIDGE_APP_ID` unset.

**Always run the suite through these scripts.** Calling `bunx playwright test`
directly skips pre-setup and the per-worker app provisioning, and the run fails
on a missing `.auth/worker-apps.json` rather than silently sharing one app.

### Parallelism: one Bridge app per worker

`paymentsAutoRedirect`, `stripeEnabled` and the SSO flags are **app-level**
settings, not per-tenant. When every worker drove one shared app, a spec that
wrote one of them wrote a value every other worker could read — the paywall spec
set `paymentsAutoRedirect: true`, a sibling worker set it back to `false`, and the
paywall spec failed reading back its own write.

So the suite does not share the app any more. `global-setup.ts` provisions one
Bridge app per worker and writes a storage state per worker carrying that app's
id as `localStorage['bridge:appId']`; the fixtures in
`e2e/playwright/fixtures/auth.ts` hand each worker its own app, test-data client
and `envConfig`. App-level writes are visible only to the worker that made them,
and tests inside a worker run serially, so nothing can be clobbered mid-test.

- The pool is sized from the **resolved worker count**, so `--workers 8` provisions
  eight apps with no other change. There is no "safe" worker count to remember and
  no serial-only mode to opt into.
- Apps are **idempotent by domain** (`BRIDGE_SVELTE_TEST_DASHBOARD`,
  `…_W1`, `…_W2`, …) and are reused across runs, not recreated. Worker 0 keeps the
  unsuffixed domain, so `--workers 1` targets exactly the app the suite always used.
- `bun run test:e2e -- <file>` still works; a filtered run provisions the same pool.
- **`VITE_BRIDGE_APP_ID` pins every worker to one app** and therefore puts the
  shared-state race back. It stays as the escape hatch for pinning an app id by
  hand, and global-setup says so in its output when you use it. Don't set it for a
  parallel run.

A spec that needs an app-level setting sets it itself and restores it in a
`finally`; the `appConfigBaseline` fixture re-applies the baseline for the next
test in that worker if a spec died before its `finally` ran. No spec should read
an app-level setting it did not write.

### How it works

- A **pre-setup script** (`e2e/playwright/pre-setup.ts`) creates the test app via bridge-api and writes its id into `e2e/playwright/.auth/base-state.json` before Playwright starts
- The demo app is started automatically via Playwright's `webServer` config with the correct Vite mode (`--mode test.local`, `--mode test.stage`, or `--mode test.prod`)
- **Global setup** re-resolves the persistent test app (`BRIDGE_SVELTE_TEST_DASHBOARD`) via bridge-api — completely separate from the Bridge admin app — and seeds its id into the browser as `localStorage['bridge:appId']`, which the demo prefers over `VITE_BRIDGE_APP_ID`. If the id cannot be resolved, setup fails naming `VITE_BRIDGE_APP_ID` and the demo env file rather than timing out on a page element
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
