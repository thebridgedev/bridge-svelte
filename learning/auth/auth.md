# Authentication

### Route protection

Pass `routeConfig` as the third argument to `bridgeBootstrap` in `+layout.ts`. The `BridgeBootstrap` component in `+layout.svelte` handles navigation guards automatically.

```ts
// src/routes/+layout.ts
import type { LayoutLoad } from './$types';
import type { BridgeConfig, RouteGuardConfig } from '@nebulr-group/bridge-svelte';
import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';

export const ssr = false;

export const load: LayoutLoad = async ({ url }) => {
  const config: BridgeConfig = {
    appId: import.meta.env.VITE_BRIDGE_APP_ID,
    loginRoute: '/auth/login',
  };

  const routeConfig: RouteGuardConfig = {
    rules: [
      { match: '/', public: true },
      { match: new RegExp('^/auth($|/)'), public: true },
      { match: '/beta/*', featureFlag: 'beta-feature', redirectTo: '/' },
    ],
    defaultAccess: 'protected',
  };

  await bridgeBootstrap(url, config, routeConfig);
  return {};
};
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { BridgeBootstrap } from '@nebulr-group/bridge-svelte';
  let { children } = $props();
  let ready = $state(false);

  function onBootstrapComplete() {
    ready = false;
    // The tick after BridgeBootstrap resolves, render children
    ready = true;
  }
</script>

<BridgeBootstrap {onBootstrapComplete} />

{#if ready}
  {@render children()}
{/if}
```

How it works:
- **`defaultAccess`** — sets whether unmatched routes are `'public'` or `'protected'`.
- **`rules`** — marks individual paths as public and/or gates them behind feature flags.
- **`loginRoute`** — unauthenticated users are redirected here (in-app) instead of to an external page.
- Redirects are handled automatically by `BridgeBootstrap`.

### Checking auth status

Use the reactive stores to check whether the user is authenticated:

```svelte
<script lang="ts">
  import { isAuthenticated, isLoading } from '@nebulr-group/bridge-svelte';
</script>

{#if $isLoading}
  <p>Loading...</p>
{:else if $isAuthenticated}
  <p>You are logged in!</p>
{:else}
  <p>Please log in to continue.</p>
{/if}
```

### Getting user profile

Access the current user's profile with `profileStore`:

```svelte
<script lang="ts">
  import { profileStore } from '@nebulr-group/bridge-svelte';

  const { profile } = profileStore;
</script>

{#if $profile}
  <h2>{$profile.fullName}</h2>
  <p>{$profile.email}</p>

  {#if $profile.tenant}
    <p>Tenant: {$profile.tenant.name}</p>
  {/if}
{:else if $profile === undefined}
  <p>Loading profile...</p>
{:else}
  <p>Not logged in</p>
{/if}
```

`profileStore` is `undefined` while loading, `null` when not authenticated, and a profile object when authenticated.

### ProfileName component

A drop-in component that renders the user's display name. No configuration needed:

```svelte
<script lang="ts">
  import { ProfileName } from '@nebulr-group/bridge-svelte';
</script>

<ProfileName />
<!-- renders: "John Doe" or "john@example.com" or nothing when not authenticated -->
```

Outputs a `<span>` with a `data-bridge-profile-name` attribute for styling. Accepts `class` and `style` props.

### Token refresh

Bridge automatically refreshes tokens before they expire. No manual intervention is needed. The `auth.token` store always holds the current valid token set.

### Logout

Call `getBridgeAuth().logout()` to clear tokens. Pass `redirectTo` to stay in the app after logout:

```svelte
<script lang="ts">
  import { getBridgeAuth } from '@nebulr-group/bridge-svelte';
  import { goto } from '$app/navigation';

  async function handleLogout() {
    await getBridgeAuth().logout({ redirectTo: '/' });
  }
</script>

<button onclick={handleLogout}>Log out</button>
```

If you omit `redirectTo`, the user is redirected externally to complete logout.

---

## SDK Auth Components

All SDK auth components are in-app — they render inside your application with no external redirects. Import them from `@nebulr-group/bridge-svelte`.

Every component accepts standard HTML `div` (or `button`) attributes like `class`, `style`, and `data-*` in addition to the props listed below.

### LoginForm

A complete login form with email/password fields. Handles multi-step auth flows inline: forgot password, magic link, passkey login, MFA challenge, MFA setup, and tenant selection all appear automatically within the same component when the auth state requires them.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `showSignupLink` | `boolean` | `false` | Show a link to the signup page |
| `signupHref` | `string` | `'/signup'` | Signup page URL |
| `showForgotPassword` | `boolean` | `true` | Show the forgot password link |
| `forgotPasswordHref` | `string` | `undefined` | External forgot password URL. If set, navigates there instead of showing the inline form |
| `showMagicLink` | `boolean` | `true` | Show the magic link login option |
| `showPasskeys` | `boolean` | `false` | Show the passkey login button |
| `onLogin` | `() => void` | — | Called after successful login (all steps complete) |
| `onError` | `(error: Error) => void` | — | Called on any login error |
| `onSsoClick` | `(connectionType: string) => void` | — | Called when an SSO button is clicked |
| `heading` | `string` | `''` | Custom heading text |
| `ssoConnections` | `FederationConnection[]` | `[]` | SSO connections to display. Auto-derived from app config if not set |
| `ssoMode` | `'redirect' \| 'popup'` | `'redirect'` | SSO kickoff strategy for the built-in buttons. See [SSO mode](#sso-mode-redirect-vs-popup). Ignored when `onSsoClick` is provided. |
| `footer` | `Snippet` | — | Custom footer content (Svelte 5 snippet) |

**Usage:**

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { LoginForm } from '@nebulr-group/bridge-svelte';
</script>

<LoginForm
  showSignupLink
  signupHref="/auth/signup"
  showForgotPassword
  showMagicLink
  showPasskeys
  onLogin={() => goto('/dashboard')}
  onError={(err) => console.error(err)}
/>
```

**Auth state transitions:** After a successful email/password login, the `LoginForm` checks the resulting auth state. If MFA is required, it automatically shows `MfaChallenge`. If MFA setup is required, it shows `MfaSetup`. If tenant selection is needed (multi-tenant user), it shows `TenantSelector`. The `onLogin` callback fires only after all steps are complete and the user is fully authenticated.

### SignupForm

A signup form with email, full name, and password fields.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSignup` | `() => void` | — | Called after successful signup |
| `onError` | `(error: Error) => void` | — | Called on signup error |
| `showLoginLink` | `boolean` | `true` | Show a link to the login page |
| `loginHref` | `string` | `'/login'` | Login page URL |
| `heading` | `string` | `'Create your account'` | Custom heading text |
| `footer` | `Snippet` | — | Custom footer content |

**Usage:**

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { SignupForm } from '@nebulr-group/bridge-svelte';
</script>

<SignupForm
  showLoginLink
  loginHref="/auth/login"
  onSignup={() => goto('/auth/login')}
  onError={(err) => console.error(err)}
/>
```

After signup, the user receives a verification email. Once verified, they can log in.

### SsoButton

A standalone SSO login button for a single federation connection. Use this when you want SSO buttons outside of `LoginForm`, or to build a custom login page.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `connection` | `FederationConnection` | **(required)** | The SSO connection object |
| `label` | `string` | `'Continue with {name}'` | Button label text |
| `mode` | `'redirect' \| 'popup'` | `'redirect'` | SSO kickoff strategy. See [SSO mode](#sso-mode-redirect-vs-popup). |
| `onSuccess` | `() => void` | — | Called after successful SSO login (popup mode only) |
| `onError` | `(error: Error) => void` | — | Called on error |
| `icon` | `Snippet` | — | Custom icon snippet |

**Usage:**

```svelte
<script lang="ts">
  import { SsoButton, type FederationConnection } from '@nebulr-group/bridge-svelte';

  let { connections }: { connections: FederationConnection[] } = $props();
</script>

{#each connections as connection}
  <SsoButton
    {connection}
    onSuccess={() => console.log('SSO login complete')}
    onError={(err) => console.error(err)}
  />
{/each}
```

#### SSO mode: redirect vs popup

Both `LoginForm` and standalone `SsoButton` support two SSO kickoff strategies via the `ssoMode` / `mode` prop:

| Mode | What happens | When to use |
|------|--------------|-------------|
| `'redirect'` **(default)** | Clicking the button navigates the current tab to the Bridge federation endpoint. The user is sent to the provider (Google, Microsoft, etc.), signs in, and the OAuth callback chain returns them to your app via the normal route guard flow. No popup, no cross-window messaging. | Almost all apps. This is the safest, most compatible default — pop-up blockers, mobile browsers, embedded webviews, and strict CSPs all work out of the box. The route guard automatically completes the auth transition when the user lands back on a protected route. |
| `'popup'` | Clicking the button opens `window.open()` to the Bridge federation endpoint with `mode=popup`. The popup completes the provider flow and `postMessage`'s the result back to the opener, which resolves the `startSsoLogin()` promise. The host page never unloads. | Embedded widgets, multi-tab dashboards, or flows that must preserve unsaved state on the host page. Requires `targetOrigin` to match your app origin (handled automatically). Pop-up blockers may interfere — handle `onError` for the "popup blocked" case. |

**Redirect mode example:**

```svelte
<LoginForm />
<!-- or explicitly -->
<LoginForm ssoMode="redirect" />
```

```svelte
<SsoButton {connection} />
<!-- or explicitly -->
<SsoButton {connection} mode="redirect" />
```

In redirect mode, `onSuccess` / `onLogin` do **not** fire on the original page — it's already navigating away. Instead, rely on your route guard + `authState` store transitions to pick up the session once the user lands back in your app.

**Popup mode example:**

```svelte
<LoginForm ssoMode="popup" />
```

```svelte
<SsoButton
  {connection}
  mode="popup"
  onSuccess={() => console.log('popup auth complete')}
  onError={(err) => {
    if (err.message.includes('popup')) {
      // popup was blocked — prompt the user to allow popups
    }
  }}
/>
```

In popup mode, the promise returned by `startSsoLogin()` resolves with the final auth result (or rejects if the popup is blocked, closed, or times out after 5 minutes), so `onSuccess` and `onError` fire as expected.

**Under the hood:** both modes hit the same backend endpoint `GET /auth/auth/federation/:appId?provider=<type>`. Popup mode additionally sends `mode=popup&targetOrigin=<origin>` query params, which the backend uses to route the final callback into a `postMessage` instead of a normal redirect.

### MfaChallenge

Prompts the user to enter an MFA code. Appears automatically inside `LoginForm` when `authState` transitions to `'mfa-required'`. Can also be used standalone.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onVerified` | `() => void` | — | Called after successful MFA verification |
| `onError` | `(error: Error) => void` | — | Called on verification error |
| `showRecoveryOption` | `boolean` | `true` | Show the recovery code toggle |

The component supports two modes:
1. **Auth code** — the user enters a 6-digit code from their authenticator app.
2. **Recovery code** — the user enters a backup recovery code.

**Standalone usage:**

```svelte
<script lang="ts">
  import { MfaChallenge, authState } from '@nebulr-group/bridge-svelte';
  import { goto } from '$app/navigation';
</script>

{#if $authState === 'mfa-required'}
  <MfaChallenge
    onVerified={() => goto('/dashboard')}
    onError={(err) => console.error(err)}
  />
{/if}
```

### MfaSetup

Guides the user through a 3-step MFA setup flow: enter phone number, verify code, save backup codes. Appears automatically inside `LoginForm` when `authState` transitions to `'mfa-setup-required'`.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onComplete` | `() => void` | — | Called after MFA setup is complete |
| `onError` | `(error: Error) => void` | — | Called on setup error |

**Standalone usage:**

```svelte
<script lang="ts">
  import { MfaSetup, authState } from '@nebulr-group/bridge-svelte';
  import { goto } from '$app/navigation';
</script>

{#if $authState === 'mfa-setup-required'}
  <MfaSetup
    onComplete={() => goto('/dashboard')}
    onError={(err) => console.error(err)}
  />
{/if}
```

### TenantSelector

Lets multi-tenant users pick which tenant to log into. Appears automatically inside `LoginForm` when `authState` transitions to `'tenant-selection'`.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSelect` | `() => void` | — | Called after tenant is selected |
| `onError` | `(error: Error) => void` | — | Called on error |
| `tenantItem` | `Snippet<[TenantUser]>` | — | Custom render snippet for each tenant item |

**Standalone usage with custom tenant item:**

```svelte
<script lang="ts">
  import { TenantSelector, authState, type TenantUser } from '@nebulr-group/bridge-svelte';
  import { goto } from '$app/navigation';
</script>

{#if $authState === 'tenant-selection'}
  <TenantSelector onSelect={() => goto('/dashboard')}>
    {#snippet tenantItem(tenant: TenantUser)}
      <div class="tenant-card">
        <strong>{tenant.tenantName}</strong>
        <span>{tenant.role}</span>
      </div>
    {/snippet}
  </TenantSelector>
{/if}
```

### MagicLink

Standalone magic link request form. When a user clicks a magic link from their email, the token is in the URL and Bridge processes it automatically during bootstrap.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSent` | `() => void` | — | Called after the magic link email is sent |
| `onError` | `(error: Error) => void` | — | Called on error |
| `loginHref` | `string` | `'/login'` | Link back to the login page |

**Usage:**

```svelte
<!-- src/routes/auth/magic-link/+page.svelte -->
<script lang="ts">
  import { MagicLink } from '@nebulr-group/bridge-svelte';
</script>

<MagicLink
  loginHref="/auth/login"
  onSent={() => console.log('Check your email!')}
  onError={(err) => console.error(err)}
/>
```

When the user clicks the link in their email, they are brought to your app. The token URL parameter is auto-handled by Bridge bootstrap.

### ForgotPassword

Dual-mode component:
1. **Request mode** (no `token` prop) — shows an email form to request a password reset link.
2. **Reset mode** (`token` prop set) — shows a new password form to complete the reset.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `token` | `string` | — | Reset token from URL. When set, shows the new password form |
| `onComplete` | `() => void` | — | Called after the email is sent (request mode) or password is reset (reset mode) |
| `onError` | `(error: Error) => void` | — | Called on error |
| `loginHref` | `string` | `'/login'` | Link back to the login page |

**Request page:**

```svelte
<!-- src/routes/auth/forgot-password/+page.svelte -->
<script lang="ts">
  import { ForgotPassword } from '@nebulr-group/bridge-svelte';
</script>

<ForgotPassword
  loginHref="/auth/login"
  onComplete={() => console.log('Reset email sent')}
/>
```

**Reset page (with token from URL):**

```svelte
<!-- src/routes/auth/reset-password/+page.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { ForgotPassword } from '@nebulr-group/bridge-svelte';
  import { goto } from '$app/navigation';

  const token = $derived($page.url.searchParams.get('token') ?? '');
</script>

<ForgotPassword
  {token}
  loginHref="/auth/login"
  onComplete={() => goto('/auth/login')}
/>
```

### Passkey components

Three components for passkey (WebAuthn) authentication. Requires `@simplewebauthn/browser` as a peer dependency.

#### PasskeyLogin

A button that triggers passkey authentication via the browser's WebAuthn API.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onLogin` | `() => void` | — | Called after successful passkey login |
| `onError` | `(error: Error) => void` | — | Called on error |
| `onSetupPasskey` | `() => void` | — | Called when the user wants to set up a passkey instead |
| `autofill` | `boolean` | `false` | Use WebAuthn conditional UI (autofill) |

```svelte
<script lang="ts">
  import { PasskeyLogin } from '@nebulr-group/bridge-svelte';
  import { goto } from '$app/navigation';
</script>

<PasskeyLogin
  onLogin={() => goto('/dashboard')}
  onError={(err) => console.error(err)}
/>
```

#### PasskeySetup

Registers a new passkey using a setup token (emailed to the user).

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `token` | `string` | **(required)** | The setup token from the URL |
| `onComplete` | `() => void` | — | Called after passkey registration |
| `onError` | `(error: Error) => void` | — | Called on error |
| `onBack` | `() => void` | — | Called when user clicks back |
| `onExpired` | `() => void` | — | Called when the token has expired |

```svelte
<!-- src/routes/auth/passkey-setup/+page.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { PasskeySetup } from '@nebulr-group/bridge-svelte';
  import { goto } from '$app/navigation';

  const token = $derived($page.url.searchParams.get('token') ?? '');
</script>

<PasskeySetup
  {token}
  onComplete={() => goto('/auth/login')}
  onExpired={() => goto('/auth/login')}
/>
```

#### PasskeyRequestSetupLink

An email form that requests a passkey setup link be sent to the user.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `initialEmail` | `string` | `''` | Pre-filled email address |
| `onBack` | `() => void` | **(required)** | Called when user clicks back |

```svelte
<script lang="ts">
  import { PasskeyRequestSetupLink } from '@nebulr-group/bridge-svelte';
</script>

<PasskeyRequestSetupLink
  initialEmail="user@example.com"
  onBack={() => console.log('Back to login')}
/>
```

### WorkspaceSelector

Lets authenticated users switch between workspaces. This is different from `TenantSelector` (which is part of the login flow). `WorkspaceSelector` is used in an already-authenticated context, for example in a settings page or sidebar.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSwitch` | `() => void` | — | Called after workspace switch |
| `onError` | `(error: Error) => void` | — | Called on error |
| `workspaceItem` | `Snippet<[{ workspace, isActive, isLoading, onSelect }]>` | — | Custom render snippet for each workspace |

**Usage:**

```svelte
<script lang="ts">
  import { WorkspaceSelector } from '@nebulr-group/bridge-svelte';
</script>

<WorkspaceSelector
  onSwitch={() => window.location.reload()}
  onError={(err) => console.error(err)}
/>
```

**Custom workspace item:**

```svelte
<script lang="ts">
  import { WorkspaceSelector, type Workspace } from '@nebulr-group/bridge-svelte';
</script>

<WorkspaceSelector onSwitch={() => window.location.reload()}>
  {#snippet workspaceItem({ workspace, isActive, isLoading, onSelect })}
    <button
      class="workspace-item"
      class:active={isActive}
      disabled={isLoading}
      onclick={onSelect}
    >
      {workspace.name}
      {#if isActive}<span>(current)</span>{/if}
    </button>
  {/snippet}
</WorkspaceSelector>
```
