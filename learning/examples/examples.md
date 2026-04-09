# Bridge Svelte Documentation

## Getting Started

- [Hosted Auth Quickstart](../quickstart/hosted-quickstart.md) — Fastest path: Bridge handles the login UI on a hosted page
- [SDK Auth Quickstart](../sdk-auth/sdk-quickstart.md) — In-app login/signup forms using SDK components

## Guides

- [Authentication](../auth/auth.md) — Auth status, profile, logout, and all SDK auth components
- [Feature Flags](../feature-flags/feature-flags.md) — FeatureFlag component, route-level flags, programmatic access
- [Payments & Subscriptions](../payments/payments.md) — PlanSelector, Stripe checkout, subscription state
- [Team Management](../team-management/team-management.md) — TeamManagementPanel
- [API Token Management](../api-tokens/api-tokens.md) — ApiTokenManagement
- [Theming & Styles](../theming/theming.md) — CSS variables, component-level overrides, headless usage

## Configuration

### BridgeConfig object

The `BridgeConfig` type (aliased from `BridgeAuthConfig` in `@nebulr-group/bridge-auth-core`) supports these fields:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `appId` | `string` | **(required)** | Your Bridge application ID |
| `loginRoute` | `string` | — | In-app route for your login page. Unauthenticated users are redirected here |
| `defaultRedirectRoute` | `string` | `'/'` | Route to redirect to after login |
| `apiBaseUrl` | `string` | `'https://api.thebridge.dev'` | Root URL for the Bridge API (dev override) |
| `hostedUrl` | `string` | `'https://auth.thebridge.dev'` | Bridge hosted UI URL (dev override) |
| `storage` | `TokenStorage` | localStorage (browser) / memory (SSR) | Token storage adapter |
| `debug` | `boolean` | `false` | Enable debug logging |

Example:

```ts
const config: BridgeConfig = {
  appId: import.meta.env.VITE_BRIDGE_APP_ID,
  loginRoute: '/auth/login',
  defaultRedirectRoute: '/dashboard',
  debug: import.meta.env.DEV,
};
```

### Environment variables

All Bridge config values can be set via environment variables in `.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_BRIDGE_APP_ID` | Your Bridge application ID | **(required)** |
| `VITE_BRIDGE_API_BASE_URL` | Root URL for the Bridge API | `https://api.thebridge.dev` |
| `VITE_BRIDGE_DEFAULT_REDIRECT_ROUTE` | Default route after login | `/` |
| `VITE_BRIDGE_LOGIN_ROUTE` | Route for your login page | `/login` |
| `VITE_BRIDGE_DEBUG` | Enable debug logging | `false` |

Example `.env`:

```env
VITE_BRIDGE_APP_ID=your-app-id-here
VITE_BRIDGE_DEFAULT_REDIRECT_ROUTE=/dashboard
VITE_BRIDGE_LOGIN_ROUTE=/auth/login
```

### readonlyConfig store

Read the resolved Bridge config at runtime:

```svelte
<script lang="ts">
  import { readonlyConfig } from '@nebulr-group/bridge-svelte';

  const config = $derived($readonlyConfig);
</script>

{#if config}
  <p>App ID: {config.appId}</p>
  <p>API Base: {config.apiBaseUrl}</p>
{/if}
```
