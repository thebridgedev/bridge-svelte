# SDK auth quickstart

> This guide covers in-app SDK auth components. For the simplest setup using Bridge's hosted login page, see the [Hosted auth quickstart](../quickstart/hosted-quickstart.md).

Get up and running with The Bridge Svelte plugin using in-app SDK auth components, with no redirects to external login pages.

## 1. Install the plugin

```bash
npm i @nebulr-group/bridge-svelte
```

Optional peer dependencies (install only if you need the feature):

| Package | When needed |
|---------|-------------|
| `@stripe/stripe-js` | Paid subscription plans (Stripe Checkout) |

Passkey (WebAuthn) support (`@simplewebauthn/browser`) is bundled with the plugin — no extra install.

Before wiring the routes, enable the auth methods you want on your Bridge app (password, magic link, passkeys, SSO providers) — components only render a method's UI when the app has it enabled:

```bash
bridge app update --magic-link-enabled true --passkeys-enabled true
```

## 2. Configuration (`+layout.ts`)

Start Bridge from your root layout with one call. The app id comes from `VITE_BRIDGE_APP_ID` in your `.env` (see step 7); you add where your login page lives and which routes are public.

```ts
// src/routes/+layout.ts
import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';

export const ssr = false;

export const load = bridgeBootstrap({
  loginRoute: '/auth/login',
  rules: [
    { match: '/', public: true },
    { match: new RegExp('^/auth($|/)'), public: true },
  ],
  defaultAccess: 'protected',
});
```

Key points:
- **`loginRoute`**: tells Bridge where to redirect unauthenticated users (your in-app login page).
- **Environment**: Bridge reads `VITE_BRIDGE_APP_ID` and, for a stage or local app, `VITE_BRIDGE_API_BASE_URL` itself. Anything you pass explicitly wins over the environment.
- **`defaultAccess: 'protected'`**: all routes require auth unless explicitly marked `public`.
- **`ssr = false`**: Bridge requires client-side rendering.

## 3. Bootstrap component (`+layout.svelte`)

Wrap your app in the `BridgeBootstrap` component. It renders its children only once Bridge is ready, so you write no loading logic yourself.

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

## 4. Create a login page

Drop the `LoginForm` component onto a page that matches your `loginRoute`.

```svelte
<!-- src/routes/auth/login/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { LoginForm, readReturnTo } from '@nebulr-group/bridge-svelte';

  function onLogin() {
    // Back to the page the visitor asked for (validated), else your default.
    goto(readReturnTo($page.url) ?? '/');
  }
</script>

<div class="login-page">
  <LoginForm showSignupLink {onLogin} />
</div>

<!-- Optional: center the form on the page. Not required for the component to work. -->
<style>
  .login-page {
    display: flex;
    justify-content: center;
    padding: 3rem 1rem;
  }
</style>
```

**`onLogin` is required.** `LoginForm` does not navigate after a successful sign-in; it calls `onLogin` and your page decides where to go. Without it the user stays on the login page. When the route guard sends a signed-out visitor here it attaches the page they asked for as `?redirectUri=…`; `readReturnTo` reads it back and returns `null` for anything that is not a same-origin path, so never read the parameter yourself (see [Returning to the page they asked for](/auth/securing/route-guards/#returning-to-the-page-they-asked-for)).

Auth method visibility (magic link, passkeys, SSO) is derived from your app's configuration in the Control Center (your admin dashboard at app.thebridge.dev).

`LoginForm` handles multi-step flows inline: forgot password, magic link requests, passkey login, MFA challenge, MFA setup, and workspace selection (a workspace is called a *tenant* in the API) all render within the same component automatically when needed.

**Optional props:** `onError` (fires on auth failure), `signupHref` (overrides the `signupRoute` config for this form's signup link).

## 5. Create a signup page

```svelte
<!-- src/routes/auth/signup/+page.svelte -->
<script lang="ts">
  import { SignupForm } from '@nebulr-group/bridge-svelte';
</script>

<div class="signup-page">
  <SignupForm showLoginLink loginHref="/auth/login" />
</div>

<!-- Optional: center the form on the page. -->
<style>
  .signup-page {
    display: flex;
    justify-content: center;
    padding: 3rem 1rem;
  }
</style>
```

After a successful signup the user receives a verification email. Once verified, they can sign in.

**Optional props:** `onSignup` (fires after successful signup), `onError` (fires on failure).

## 6. Styles

See [Theming & Styles](../theming/theming.md) for customization options.

## 7. Configuration

The options you pass to `bridgeBootstrap` are `BridgeConfig` fields plus your route rules. The most common fields:

| Field | Default | Description |
|-------|---------|-------------|
| `appId` | `VITE_BRIDGE_APP_ID` **(required)** | Your Bridge app ID |
| `loginRoute` | (unset) | In-app route of your login page; unauthenticated users are redirected here |
| `signupRoute` | `'/auth/signup'` | In-app route of your signup page; `LoginForm`'s signup link points here |
| `apiBaseUrl` | `VITE_BRIDGE_API_BASE_URL`, else `https://api.thebridge.dev` | Root URL for the Bridge API — set it for any non-production app (stage, local, self-hosted) |
| `hostedUrl` | `VITE_BRIDGE_HOSTED_URL`, else `https://auth.thebridge.dev` | Bridge hosted UI URL (non-production override) |
| `debug` | `VITE_BRIDGE_DEBUG === 'true'`, else `false` | Enable debug logging |

Where a user lands after sign-in is decided by your `onLogin` (above), not by a config field.

See the [Configuration reference](/auth/config/) for the full list (token storage, billing routes).

Bridge reads its settings from these variables in your `.env` file (the `VITE_` prefix is required for values to reach the browser). Anything you pass to `bridgeBootstrap()` explicitly wins over the environment, and the environment wins over the default:

```env
VITE_BRIDGE_APP_ID=your-app-id-here
# Only for a non-production app (stage, local, self-hosted):
# VITE_BRIDGE_API_BASE_URL=https://api-stage.thebridge.dev
```

With no app id anywhere, Bridge refuses to start and names `VITE_BRIDGE_APP_ID`. A production app sets only the app id; in a development build Bridge warns once in the console when it is using production because `VITE_BRIDGE_API_BASE_URL` is unset.

## 8. Logging out — stay in YOUR app

Always pass `redirectTo` when calling `logout()` in SDK mode:

```svelte
<button onclick={() => getBridgeAuth().logout({ redirectTo: '/auth/login' })}>
  Log out
</button>
```

Without `redirectTo`, `logout()` sends the user to the **hosted Bridge portal**
(`hostedUrl`, default `auth.thebridge.dev`) instead of your in-app login page —
which is almost never what an SDK-mode app wants.

## Next steps

- **More auth UI components**: [MFA](/auth/ui/mfa/), [passkeys](/auth/ui/passkeys/), [magic link](/auth/ui/magic-link/), [SSO login button](/auth/ui/google-sso/), [switching workspaces](/auth/ui/switching-workspaces/), and [user & team management](/auth/ui/team-management/).
- **The user token**: [logging in and logging out](/auth/user-token/logging-in-and-out/), [getting the token](/auth/user-token/getting-the-token/), and [auth states](/auth/user-token/auth-states/).
- **Route protection**: [frontend route guards](/auth/securing/route-guards/), or browse the full [Auth](/auth/) section.
- **Feature flags and billing**: [how flags work](/feature-flags/how-it-works/) and [how billing works](/billing/how-it-works/).
