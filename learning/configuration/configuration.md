# Configuration Reference

### BridgeConfig type

The config object you pass to `bridgeBootstrap`:

```typescript
interface BridgeConfig {
  /** Your Bridge application ID (required) */
  appId: string;

  /** Where the login flow redirects back to.
   *  @default `${window.location.origin}/auth/oauth-callback` */
  callbackUrl?: string;

  /** Base URL for the Bridge API. All endpoints are derived from this.
   *  @default 'https://api.thebridge.dev' */
  apiBaseUrl?: string;

  /** Base URL for the Bridge hosted UI (login page, plan selection, etc.).
   *  @default 'https://auth.thebridge.dev' */
  hostedUrl?: string;

  /** Route to redirect to after login. @default '/' */
  defaultRedirectRoute?: string;

  /** In-app route of your login page. Leave unset for hosted auth —
   *  without it, unauthenticated users go to the Bridge hosted login page. */
  loginRoute?: string;

  /** In-app route of your signup page (SDK auth). */
  signupRoute?: string;

  /** Billing routes used by the payment flow. */
  billing?: {
    /** Route to send billing-locked workspaces to. */
    paywallRoute?: string;
    /** Route to land on when a payment fails. */
    paymentErrorRoute?: string;
  };

  /** Token storage adapter. Defaults to localStorage (browser) or memory (SSR). */
  storage?: TokenStorage;

  /** Enable debug logging. @default false */
  debug?: boolean;
}
```

### bridgeBootstrap()

Call it from your root `+layout.ts` load function:

```typescript
// src/routes/+layout.ts
import type { LayoutLoad } from './$types';
import type { BridgeConfig, RouteGuardConfig } from '@nebulr-group/bridge-svelte';
import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';

export const ssr = false;

export const load: LayoutLoad = async ({ url, fetch }) => {
  const config: BridgeConfig = {
    appId: import.meta.env.VITE_BRIDGE_APP_ID,
    loginRoute: '/auth/login',
  };

  const routeConfig: RouteGuardConfig = {
    rules: [
      { match: '/', public: true },
      { match: new RegExp('^/auth($|/)'), public: true },
    ],
    defaultAccess: 'protected',
  };

  await bridgeBootstrap(url, config, routeConfig, fetch);
  return {};
};
```

Signature:

```typescript
bridgeBootstrap(
  url: URL,                       // the current URL from the load function
  config: BridgeConfig | string,  // config object, or just the appId as a string
  routeConfig?: RouteGuardConfig, // default: { rules: [], defaultAccess: 'protected' }
  kitFetch?: typeof fetch         // pass SvelteKit's fetch for SSR-safe requests
)
```

Bootstrap is idempotent — calling it again after it has completed is a no-op.

### RouteGuardConfig

Declares which routes are public, protected, flag-gated, or billing-gated:

```typescript
interface RouteGuardConfig {
  rules: RouteRule[];
  /** Access for routes no rule matches. @default 'protected' */
  defaultAccess?: 'public' | 'protected';
}

interface RouteRule {
  /** Path to match — exact string or RegExp. */
  match: string | RegExp;
  /** Route is accessible without authentication. */
  public?: boolean;
  /** Require feature flag(s): a key, { any: [...] }, or { all: [...] }. */
  featureFlag?: string | { any: string[] } | { all: string[] };
  /** Where to send users who fail the featureFlag requirement. */
  redirectTo?: string;
  /** Billing gate. 'soft' (default) renders the route and relies on the
   *  in-app notice; 'hard' redirects a billing-locked workspace to its
   *  recovery URL. */
  billing?: 'soft' | 'hard';
}
```

### Passing values via .env

Keep environment-specific values in a `.env` file instead of hardcoding them, and read them with Vite's `import.meta.env` when you build the config. The `VITE_` prefix is required for values to reach the browser; the SDK does not read environment variables automatically.

```env
VITE_BRIDGE_APP_ID=your-app-id-here
VITE_BRIDGE_API_BASE_URL=https://api.thebridge.dev
VITE_BRIDGE_DEFAULT_REDIRECT_ROUTE=/dashboard
```

```typescript
const config: BridgeConfig = {
  appId: import.meta.env.VITE_BRIDGE_APP_ID,
  apiBaseUrl: import.meta.env.VITE_BRIDGE_API_BASE_URL,
  defaultRedirectRoute: import.meta.env.VITE_BRIDGE_DEFAULT_REDIRECT_ROUTE ?? '/',
  debug: import.meta.env.DEV,
};
```

### Reading the resolved config

Read the active config at runtime via the `readonlyConfig` store:

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
