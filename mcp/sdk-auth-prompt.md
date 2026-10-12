# Bridge SvelteKit Integration — In-app Sign-in (SDK Auth)

You are integrating The Bridge into a SvelteKit application with **sign-in inside the app**: the login, signup and password pages render in the app's own layout, and users never leave it. The plugin serves every one of those pages from one file. You write no login, signup, callback or set-password page.

`bridge guide mechanisms` explains the customisation rungs and the rest of the model this guide uses.

> **Version.** `BridgeAuthRoutes` and the one-call `bridgeBootstrap()` need `@nebulr-group/bridge-svelte` 0.9 or later. If the installed version does not export `BridgeAuthRoutes`, upgrade; do not hand-write the pages.

## The one rule for app code

**Every gate in app code is a flag.** A link, a page, a button, an endpoint: if some people get it and others do not, the code asks a flag, and the flag's rule says why: a privilege (`privileges contains "USER_WRITE"`), a plan feature (`bridge:billing.entitlement.analytics eq true`) or a rollout. App code never reads a role, a privilege list, the plan or a plan feature to decide what someone may see or do.

Two things are not gates and are not flags: **numbers** are plan limits (`<QuotaGate>` in the browser, `@RequireQuota` on the backend), and **permission on one specific record** stays in app code ("only the author edits their post").

Before calling the work done, run `npx @nebulr-group/bridge-cli check gates` in the project. It lists every direct role, privilege, plan or plan-feature check with the flag to use instead. Fix each one.

In SvelteKit: a piece of UI is `<FeatureFlag key="…">`; a page is a route rule `{ match: '/admin/*', featureFlag: 'admin-area', redirectTo: '/' }`; a nav link is the same `<FeatureFlag>` around the link.

## Decide first — hosted or in-app?

| You want | Mode | Config |
|---|---|---|
| Login inside the app, matching the app's design | **In-app** (default) — this guide | `loginRoute: '/auth/login'` |
| Bridge owns the login UI | **Hosted** — `bridge guide svelte`, only when the developer explicitly asks for it | nothing |

`loginRoute` is the whole switch; the files are identical. Do not ask the developer to choose: this guide is the approach unless they asked for hosted. Tell them in one line that sign-in will be in-app, styled to match their app.

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

## Match the app's design — always

The pages render inside the app, so they must look like the rest of it. Bridge's built-in look (indigo buttons, grey borders) is a fallback for an app with no design, never the finished result. Do this without asking:

1. **Read the app's design.** The global stylesheet (`src/app.css` or what `+layout.svelte` imports) and its CSS variables, `tailwind.config.*` or the Tailwind `@theme` block, a component library's theme (shadcn-svelte, Skeleton, Flowbite, …), the font the app loads, and one existing primary button and text input.
2. **Set the tokens from it** in the app's own global stylesheet, pointing at the app's variables rather than copying values, so dark mode and later theme changes carry over:

   ```css
   /* src/app.css — Bridge sign-in pages take the app's design */
   :root {
     --bridge-primary: var(--color-primary);          /* the app's primary button background */
     --bridge-primary-hover: var(--color-primary-hover);
     --bridge-primary-fg: var(--color-primary-foreground);
     --bridge-border: var(--color-border);
     --bridge-input-focus: var(--color-ring);
     --bridge-border-radius: var(--radius);
     --bridge-foreground: var(--color-foreground);
     --bridge-muted: var(--color-muted-foreground);
     --bridge-bg: var(--color-background);
     --bridge-muted-bg: var(--color-muted);
   }
   ```

   The variable names on the right are examples: use the ones the app actually defines, or its literal values when it has no variables (a Tailwind app without CSS variables: the hex values of its `primary`, `border` and so on). Map its error and success colours to the `--bridge-alert-*` tokens. The components inherit the page font; set nothing for it unless the app puts its font on something other than `body`. The full list is the token contract in `bridge guide mechanisms`.
3. **Give the pages the app's frame** when the app's own pages sit in a card, a panel or a split layout: pass the `frame` snippet (rung 2 below) using the app's own classes or components, so sign-in is not the one page that looks different.

Ask the developer for colours only when the project has no styles of its own.

## Customising further — take the lowest rung that does the job

0. **Layout.** The pages already sit inside the app's layout.
1. **Tokens.** Set `--bridge-*` CSS variables (`--bridge-primary`, `--bridge-border-radius`, `--bridge-auth-page-padding`, …), as in *Match the app's design*. The full list is the token contract in `bridge guide mechanisms`.
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
- [ ] The app's global stylesheet sets the `--bridge-*` tokens from the app's own design; `frame` used when the app frames its pages
- [ ] No page under `src/routes/auth/` that only renders a Bridge component; a page the app owns navigates in `onLogin` via `readReturnTo`
- [ ] Bridge app: every dev origin allowed, self-signup on, the chosen sign-in methods on
- [ ] `logout()` passes `redirectTo`

## Verify

1. The build passes.
2. Signed out, a protected page redirects to `/auth/login` in the app (not an external page). Next to one of the app's own pages, its buttons, inputs, font, corners and frame match — in dark mode too if the app has one. No Bridge indigo is left.
3. Sign in: the page leaves `/auth/login` for the page you asked for. **Network calls succeed but the page stays put** → the app owns its login page and its `LoginForm` has no `onLogin`. **`403 Origin not allowed`** → add the origin (scheme, host and port).
4. Sign up at `/auth/signup`; the verification email links to `{origin}/auth/set-password/{token}?flow=signup` and opens the "Set new password" form. A 404 there means the catch-all is missing or misnamed — the folder must be `[...bridge]`.
5. Forgot password from the login page: the reset link lands on the same set-password form.
6. Log out: you land on the app's `/auth/login`, not Bridge's hosted page.
7. `/auth/not-a-page` shows the app's 404.
8. The developer does steps 2–6 themselves in a browser; do not create test users for them. If a step fails, `bridge event auth-attempts --user <their email>` names the reason (`WRONG_PASSWORD`, `ORIGIN_NOT_ALLOWED`, …) and the fix.
