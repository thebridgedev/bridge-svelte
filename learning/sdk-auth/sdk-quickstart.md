# SDK auth quickstart

> This guide covers in-app SDK auth components. For the simplest setup using Bridge's hosted login page, see the [Hosted auth quickstart](../quickstart/hosted-quickstart.md).

Get up and running with The Bridge Svelte plugin using in-app SDK auth components, with no redirects to external login pages.

## 1. Install the plugin

```bash
npm i @nebulr-group/bridge-svelte
```

Nothing else to install: passkey (WebAuthn) support ships with the plugin, and checkout is a plain redirect to Stripe, so `@stripe/stripe-js` is not needed.

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

## 4. Serve the auth pages — one file

```svelte
<!-- src/routes/auth/[...bridge]/+page.svelte -->
<script lang="ts">
  import { BridgeAuthRoutes } from '@nebulr-group/bridge-svelte';
</script>

<BridgeAuthRoutes />
```

That file serves every auth page, inside your own layout:

| Address | Renders |
|---|---|
| `/auth/login` | `LoginForm` — password plus the inline magic link, passkey, SSO, forgot-password, MFA and workspace steps |
| `/auth/signup` | `SignupForm` |
| `/auth/oauth-callback` | nothing — Bridge finishes the login and redirects before it renders |
| `/auth/set-password/[token]` | `ForgotPassword` with the token — where signup verification and password-reset emails land |
| `/auth/forgot-password` | `ForgotPassword` |
| `/auth/magic-link` | `MagicLink` |
| `/auth/setup-passkey/[token]` | `PasskeySetup` |
| `/auth/workspaces` | `WorkspaceSelector` |

Any other address under `/auth` gets your app's own 404.

After sign-in the user goes back to the page they asked for (the route guard attaches it as `?redirectUri=…`, and it is validated before use), or to `/`. Pass `redirectTo` to change the fallback: `<BridgeAuthRoutes redirectTo="/dashboard" />`.

Which sign-in methods appear (magic link, passkeys, SSO) comes from your app's configuration in the Control Center (your admin dashboard at app.thebridge.dev). Turning one on or off there needs no code change and no deploy.

## 5. Make the pages yours

Pick the lowest rung that does the job:

1. **CSS variables.** The `--bridge-*` tokens restyle the forms (see [Theming & Styles](../theming/theming.md)); `--bridge-auth-page-padding` sets the page padding.
2. **Frame and heading.** Restyle everything around the form, on every page, without owning a route:

   ```svelte
   <BridgeAuthRoutes>
     {#snippet frame(page, children)}
       <main class="auth-card">{@render children()}</main>
     {/snippet}
     {#snippet heading(page)}
       <h1>{page === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
     {/snippet}
   </BridgeAuthRoutes>
   ```

   `frame` replaces the default centred container. `heading` replaces the form heading on each page's main step (the credentials step, the signup form, the set-password form); sub-steps such as "Reset your password" keep their own, so two headings never stack.
3. **Take over one page.** Create its file — for example `src/routes/auth/login/+page.svelte`. SvelteKit prefers the specific route over `[...bridge]`, so yours renders and the other pages keep working:

   ```svelte
   <!-- src/routes/auth/login/+page.svelte -->
   <script lang="ts">
     import { goto } from '$app/navigation';
     import { page } from '$app/stores';
     import { LoginForm, readReturnTo } from '@nebulr-group/bridge-svelte';
   </script>

   <LoginForm onLogin={() => goto(readReturnTo($page.url) ?? '/')} />
   ```

   A page you own navigates after sign-in itself — `LoginForm` calls `onLogin` and never navigates. `readReturnTo` returns `null` for anything that is not a same-origin path, so never read the parameter yourself (see [Returning to the page they asked for](/auth/securing/route-guards/#returning-to-the-page-they-asked-for)).
4. **Headless.** Build your own UI on `getBridgeAuth()`.

## 6. Styles

See [Theming & Styles](../theming/theming.md) for customization options.

## 7. Configuration

The options you pass to `bridgeBootstrap` are `BridgeConfig` fields plus your route rules. The most common fields:

| Field | Default | Description |
|-------|---------|-------------|
| `appId` | `VITE_BRIDGE_APP_ID` **(required)** | Your Bridge app ID |
| `loginRoute` | (unset) | In-app route of your login page; unauthenticated users are redirected here |
| `apiBaseUrl` | `VITE_BRIDGE_API_BASE_URL`, else `https://api.thebridge.dev` | Root URL for the Bridge API — set it for any non-production app (stage, local, self-hosted) |
| `hostedUrl` | `VITE_BRIDGE_HOSTED_URL`, else derived from the API address on Bridge's own domains, else `https://auth.thebridge.dev` | Bridge hosted UI URL (local or self-hosted override) |
| `debug` | `VITE_BRIDGE_DEBUG === 'true'`, else `false` | Enable debug logging |

Where a user lands after sign-in is decided by `redirectTo` on `<BridgeAuthRoutes>` (or your own `onLogin`), not by a config field.

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
