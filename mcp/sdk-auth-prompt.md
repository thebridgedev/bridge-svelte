# Bridge SvelteKit Integration — In-app Sign-in (SDK Auth)

You are integrating The Bridge into a SvelteKit application with **sign-in inside the app**: the login, signup and password pages render in the app's own layout, and users never leave it. The plugin serves every one of those pages from one file. You write no login, signup, callback or set-password page.

`bridge guide mechanisms` explains the customisation rungs and the rest of the model this guide uses.

> **Version.** `BridgeAuthRoutes` and the one-call `bridgeBootstrap()` need `@nebulr-group/bridge-svelte` 0.9 or later. If the installed version does not export `BridgeAuthRoutes`, upgrade; do not hand-write the pages.

## Decide first — hosted or in-app?

| You want | Mode | Config |
|---|---|---|
| Bridge owns the login UI | **Hosted** (default) — `bridge guide svelte` | nothing |
| Login inside the app, the app's styling | **In-app** — this guide | `loginRoute: '/auth/login'` |

`loginRoute` is the whole switch; the files are identical. If the developer has not said which they want, ask.

## Before you start — the Bridge app's settings

- **Allowed origins** must list every origin the app is served from, each dev port included (`http://localhost:5173` and `:5175` differ). From an unlisted origin, sign-in itself answers `403 {"message":"Origin not allowed"}` — password sign-in, the exchange that finishes magic-link, passkey and MFA sign-in, signup and passkeys. Sending a magic link still succeeds, so that failure shows after the link is clicked. `bridge app update --allowed-origins <origins>`, or Bridge admin → **Authentication** → **Security** → **Allowed Origins**.
- **Self-signup** must be on for the signup page to work: `bridge app update --tenant-self-signup true`.
- **Sign-in methods** the developer wants (magic link, passkeys, MFA, SSO) are switched on in the app, not in code: `bridge app update --magic-link-enabled true --passkeys-enabled true`, `bridge setup sso`. The pages show a method only when it is on. Which methods to offer is the developer's call — ask.

`bridge app get` and `bridge auth config` show the current values.

## Install

```bash
{pm} add @nebulr-group/bridge-svelte
```

Nothing else: passkey support ships with the plugin.

If `bridgeBootstrap()` and `<BridgeBootstrap>` are already wired (a hosted setup), skip to *Convert a hosted setup*. Migrating from `@nebulr/nblocks-svelte`: see `bridge guide svelte`.

## The files

**`.env`**:

```env
VITE_BRIDGE_APP_ID=your-app-id
# Only for a stage, local or self-hosted app:
# VITE_BRIDGE_API_BASE_URL=https://api-stage.thebridge.dev
```

**`src/routes/+layout.ts`**:

```ts
import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';

export const ssr = false;

export const load = bridgeBootstrap({
  loginRoute: '/auth/login',
  rules: [{ match: new RegExp('^/auth($|/)'), public: true }],
});
```

**`src/routes/+layout.svelte`**:

```svelte
<script lang="ts">
  import { BridgeBootstrap } from '@nebulr-group/bridge-svelte';
  import '@nebulr-group/bridge-svelte/styles';

  let { children } = $props();
</script>

<BridgeBootstrap>
  {@render children()}
</BridgeBootstrap>
```

**`src/routes/auth/[...bridge]/+page.svelte`**:

```svelte
<script lang="ts">
  import { BridgeAuthRoutes } from '@nebulr-group/bridge-svelte';
</script>

<BridgeAuthRoutes />
```

Bridge reads the `VITE_BRIDGE_*` variables itself (*explicit option > environment > default*); with no app id it refuses to start and names the variable. Everything is protected by default and only `/auth/*` is public. `<BridgeBootstrap>` renders the app once Bridge is ready — write no ready-state logic. `bridge guide svelte` explains each piece in more detail.

## What the one auth file serves

| Address | Renders | Notes |
|---|---|---|
| `/auth/login` | `LoginForm` | Password, plus magic link, passkey, SSO, forgot password, MFA and workspace choice as inline steps when enabled. After sign-in: the `?redirectUri=` deep link (validated), else `redirectTo` |
| `/auth/signup` | `SignupForm` | Sends a verification email |
| `/auth/oauth-callback` | nothing | The code is exchanged in the layout `load` before the page renders |
| `/auth/set-password/[token]` | `ForgotPassword` with the token | Where **both** signup verification and password-reset emails land |
| `/auth/forgot-password` | `ForgotPassword` | |
| `/auth/magic-link` | `MagicLink` | A link requested here also signs in here |
| `/auth/setup-passkey/[token]` | `PasskeySetup` | From a one-time email link |
| `/auth/workspaces` | `WorkspaceSelector` | Switch workspace; signed-out visitors go to login first |

Any other address under `/auth` gets the app's own 404. The pages render inside the app's `+layout.svelte`, so its navigation stays around them. Signup cannot break because a page was forgotten: the set-password page the verification email links to is always served. Props: `redirectTo` (default `'/'`) and `messages` (copy overrides).

## Customising — take the lowest rung that does the job

0. **Nothing.** The pages already sit inside the app's layout.
1. **Tokens.** Set `--bridge-*` CSS variables (`--bridge-primary`, `--bridge-border-radius`, `--bridge-auth-page-padding`, …). The full list is the token contract in `bridge guide mechanisms`.
2. **Frame and heading.** Two snippets restyle everything around the form on every page, without owning a route:

   ```svelte
   <script lang="ts">
     import { BridgeAuthRoutes, type BridgeAuthPage } from '@nebulr-group/bridge-svelte';

     const titles: Partial<Record<BridgeAuthPage, string>> = {
       login: 'Welcome back',
       signup: 'Create your account',
     };
   </script>

   <BridgeAuthRoutes>
     {#snippet frame(page, children)}
       <main class="auth-card">{@render children()}</main>
     {/snippet}
     {#snippet heading(page)}
       <h1>{titles[page] ?? 'Account'}</h1>
     {/snippet}
   </BridgeAuthRoutes>
   ```

   `frame(page, children)` replaces the default centred container. `heading(page)` replaces the heading of each page's main step only (credentials, the signup form, the set-password form); sub-steps such as "Reset your password" keep theirs, so two never stack. There are no per-page snippets.
3. **Take over one page.** Create its own file, e.g. `src/routes/auth/login/+page.svelte`. SvelteKit prefers it over `[...bridge]`; every other page keeps working. Build it from the component in the table:

   ```svelte
   <script lang="ts">
     import { goto } from '$app/navigation';
     import { page } from '$app/stores';
     import { LoginForm, readReturnTo } from '@nebulr-group/bridge-svelte';
   </script>

   <LoginForm onLogin={() => goto(readReturnTo($page.url) ?? '/')} />
   ```

   `LoginForm` never navigates; a page you own does it in `onLogin`. Always go through `readReturnTo`: navigating to a raw query parameter is an open redirect.
4. **Headless.** Build your own UI on `getBridgeAuth()`.

`LoginForm` drives forgot password, magic link, passkeys, MFA and workspace selection itself, from app settings the client cannot see. If you are about to write a password input, a second form is almost never the answer — take rung 2 or 3.

## Sign in and out

```svelte
<script lang="ts">
  import { isAuthenticated, profileStore, getBridgeAuth } from '@nebulr-group/bridge-svelte';
</script>

{#if $isAuthenticated}
  <span>{$profileStore?.fullName ?? $profileStore?.email}</span>
  <button onclick={() => getBridgeAuth().logout({ redirectTo: '/auth/login' })}>Log out</button>
{:else}
  <a href="/auth/login">Log in</a>
{/if}
```

- In-app, **always pass `redirectTo` to `logout()`**; without it the user lands on Bridge's hosted page.
- A signed-out visitor on a protected page is sent to `/auth/login?redirectUri=…` and returned there after signing in.
- `profileStore` is the store itself: `$profileStore`, never `const { profile } = profileStore`.
- Calls to the app's own backend go through `bridgeFetch` (see `bridge guide svelte`); do not write a `fetchWithAuth` helper.

## Convert a hosted setup

1. Add `loginRoute: '/auth/login'` to the `bridgeBootstrap()` call. An older layout that calls `await bridgeBootstrap(url, config, routeConfig)` inside its own `load` should become the one-call form above, with the app wrapped in `<BridgeBootstrap>`; the old form still works but reads no environment variables.
2. Make sure `src/routes/auth/[...bridge]/+page.svelte` exists, and delete any page under `src/routes/auth/` that only renders a Bridge component (an old empty `oauth-callback/+page.svelte`, say): a specific page file hides the catch-all's page.
3. Replace `auth.login()` buttons with `<a href="/auth/login">`, and add `redirectTo` to `logout()`.

## Checklist

- [ ] `.env` has `VITE_BRIDGE_APP_ID` (plus `VITE_BRIDGE_API_BASE_URL` for a stage or local app)
- [ ] `src/routes/+layout.ts`: `ssr = false`, `bridgeBootstrap({ loginRoute: '/auth/login', rules })`, only `/auth/*` public
- [ ] `src/routes/+layout.svelte`: styles imported, app inside `<BridgeBootstrap>`
- [ ] `src/routes/auth/[...bridge]/+page.svelte` renders `<BridgeAuthRoutes />` (with `frame` / `heading` if restyled)
- [ ] No page under `src/routes/auth/` that only renders a Bridge component; a page the app owns navigates in `onLogin` via `readReturnTo`
- [ ] Bridge app: every dev origin allowed, self-signup on, the chosen sign-in methods on
- [ ] `logout()` passes `redirectTo`

## Verify

1. The build passes.
2. Signed out, a protected page redirects to `/auth/login` in the app (not an external page), styled.
3. Sign in: the page leaves `/auth/login` for the page you asked for. **Network calls succeed but the page stays put** → the app owns its login page and its `LoginForm` has no `onLogin`. **`403 Origin not allowed`** → add the origin (scheme, host and port).
4. Sign up at `/auth/signup`; the verification email links to `{origin}/auth/set-password/{token}?flow=signup` and opens the "Set new password" form. A 404 there means the catch-all is missing or misnamed — the folder must be `[...bridge]`.
5. Forgot password from the login page: the reset link lands on the same set-password form.
6. Log out: you land on the app's `/auth/login`, not Bridge's hosted page.
7. `/auth/not-a-page` shows the app's 404.
8. Without a browser: `bridge test-user create`, then `bridge test-user verify` with its credentials; a failure names the reason (`WRONG_PASSWORD`, `ORIGIN_NOT_ALLOWED`, …), and `bridge event auth-attempts` shows recent sign-in failures.
