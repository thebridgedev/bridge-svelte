# Bridge SvelteKit Integration

You are integrating The Bridge into a SvelteKit application. The whole integration is one `.env` line and three small files; the plugin serves every sign-in page itself. This guide sets up **hosted sign-in** (Bridge's login page, the default). For sign-in inside the app, read `bridge guide svelte sdk-auth` instead — it is the same files plus one config field.

`bridge guide mechanisms` explains the rules everything here builds on (the server decides limits, the three UI levels, the four customisation rungs). Read it when the developer asks for more than this guide covers.

## The one rule for app code

**Every gate in app code is a flag.** A link, a page, a button, an endpoint: if some people get it and others do not, the code asks a flag, and the flag's rule says why: a privilege (`privileges contains "USER_WRITE"`), a plan feature (`bridge:billing.entitlement.analytics eq true`) or a rollout. App code never reads a role, a privilege list, the plan or a plan feature to decide what someone may see or do.

Two things are not gates and are not flags: **numbers** are plan limits (`<QuotaGate>` in the browser, `@RequireQuota` on the backend), and **permission on one specific record** stays in app code ("only the author edits their post").

Before calling the work done, run `npx @nebulr-group/bridge-cli check gates` in the project. It lists every direct role, privilege, plan or plan-feature check with the flag to use instead. Fix each one.

In SvelteKit: a piece of UI is `<FeatureFlag key="…">`; a page is a route rule `{ match: '/admin/*', featureFlag: 'admin-area', redirectTo: '/' }`; a nav link is the same `<FeatureFlag>` around the link.

## Decide first — hosted or in-app sign-in?

| You want | Mode | Config |
|---|---|---|
| The fastest path; Bridge owns the login UI | **Hosted** (default) — this guide | nothing |
| Login inside the app, the app's styling | **In-app (SDK auth)** — `bridge guide svelte sdk-auth` | `loginRoute: '/auth/login'` |

`loginRoute` in `bridgeBootstrap()` is the whole switch; the files are the same. If the developer has not said which they want, ask.

## Install

```bash
{pm} add @nebulr-group/bridge-svelte
```

Use the project's package manager (`bun add`, `pnpm add`, `yarn add`, `npm i`). Nothing else to install.

**Migrating from `@nebulr/nblocks-svelte`:** remove that package and any local tarball reference, rename `VITE_NBLOCKS_APP_ID` to `VITE_BRIDGE_APP_ID`, replace `<NblocksBootStrap>` with the layout below, and turn `PUBLIC_ROUTES` into `rules` (below). Do not carry the old public routes over: start with everything protected and let the developer open pages up.

## The files

**`.env`** — the app id from `bridge app get`:

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

That is the integration. What each piece does:

- **Settings are read for you.** Bridge reads `VITE_BRIDGE_APP_ID`, `VITE_BRIDGE_API_BASE_URL`, `VITE_BRIDGE_HOSTED_URL` and `VITE_BRIDGE_DEBUG` itself. Each field resolves as *explicit option > environment > default*, so `bridgeBootstrap({ appId: 'other', rules })` wins over `.env`. With no app id anywhere Bridge refuses to start and names `VITE_BRIDGE_APP_ID`. Without `VITE_BRIDGE_API_BASE_URL` it talks to production, and a development build warns once in the console; the hosted login address follows the API address on Bridge's own domains, so only a local or self-hosted Bridge sets `VITE_BRIDGE_HOSTED_URL`.
- **`ssr = false`** is required: Bridge runs in the browser.
- **Everything is protected by default.** Only `/auth/*` must be public; the rules above say so.
- **`<BridgeBootstrap>`** renders the app only once Bridge is ready (so protected content never flashes), finishes the OAuth callback, starts feature flags and live updates, and opens the upgrade dialog when your backend refuses a request at a plan limit. Write no ready-state logic of your own; put your navigation and shell inside it.
- **The styles import** gives the Bridge components their structure and default look. Keep it even with Tailwind or a design system; restyle through the `--bridge-*` tokens.
- **The `[...bridge]` file** serves `/auth/oauth-callback` (the code is exchanged in the layout `load`, before the page renders). Every other sign-in address under `/auth` shows a short "sign-in is hosted" page with a button to the login, for old bookmarks and emailed links. Any other address under `/auth` gets the app's own 404. It is the same file in-app sign-in uses, so switching later is one config field, not new pages.

## Configure the Bridge app

The app must accept the callback URL and the frontend's origin:

```bash
bridge app update \
  --ui-url http://localhost:5173 \
  --default-callback-uri http://localhost:5173/auth/oauth-callback \
  --redirect-uris http://localhost:5173/auth/oauth-callback \
  --allowed-origins http://localhost:5173
```

Use the real dev URL (and later the production domain). `bridge app redirect-uris add <url>` adds one callback without replacing the list. Allowed origins are more than CORS: from an origin that is not listed, in-app sign-in answers `403 {"message":"Origin not allowed"}`. Add every origin the app is served from, each dev port included. Without the CLI: Bridge admin → **Authentication** → **Security** → **Allowed Origins**.

## Sign in and out

```svelte
<script lang="ts">
  import { auth, isAuthenticated, profileStore } from '@nebulr-group/bridge-svelte';
</script>

{#if $isAuthenticated}
  <span>{$profileStore?.fullName ?? $profileStore?.email}</span>
  <button onclick={() => auth.logout()}>Log out</button>
{:else}
  <button onclick={() => auth.login()}>Log in</button>
{/if}
```

A signed-out visitor on a protected page is sent to the login and brought back to that page afterwards; the button is only for pages that are public. `profileStore` **is** the store: use `$profileStore`, never `const { profile } = profileStore` (that `profile` is `undefined`, so nothing renders).

**Route rules.** `match` takes a string (exact, or with `*`: `'/docs/*'`) or a `RegExp`; the first match wins. `public: true` opens a page. `featureFlag: 'key'` plus `redirectTo` hides a page unless the flag is on. The rules decide what the browser renders; they are not authorization — your API still verifies the token.

## Reading state

| You need | Use |
|---|---|
| Signed in? | `$isAuthenticated` |
| The user | `$profileStore` (`undefined` while loading, `null` when signed out) |
| The access token for a client that takes no `fetch` (axios) | `$tokenStore?.accessToken` |
| Workspace, subscription, branding, live | the `bridge` object: `bridge.tenant.subscription`, `bridge.app.branding`, `bridge.user` (Svelte stores) |
| Whether someone gets a feature (their privileges, their plan, a rollout) | a flag: `<FeatureFlag key>` / `useFlag(key, default)` from `@nebulr-group/bridge-svelte/flags`, or a route rule with `featureFlag` — `bridge guide svelte feature-flags` |
| How much of a limit is left | `useQuota(metric)`, `<QuotaGate metric>` — `bridge guide svelte billing` |

## Calling your own backend

```ts
import { bridgeFetch } from '@nebulr-group/bridge-svelte';

const res = await bridgeFetch('/api/projects', { method: 'POST', body: JSON.stringify(input) });
```

`bridgeFetch` is `fetch` with the user's token attached and one refresh-and-retry on `401`. Hand it to a GraphQL client as its `fetch` (`createClient({ url: '/graphql', fetch: bridgeFetch })`). Use it for **your** backend only, never a third-party URL. Do not write a `fetchWithAuth` helper.

## Everything else the package exports

Reach for these before writing an equivalent; each is imported from `@nebulr-group/bridge-svelte`.

| Component | Does | Guide |
|---|---|---|
| `BridgeAuthRoutes`, `LoginForm`, `SignupForm`, `ForgotPassword`, `MagicLink`, `PasskeyLogin`, `PasskeySetup`, `PasskeyRequestSetupLink`, `MfaChallenge`, `MfaSetup`, `SsoButton`, `WorkspaceSelector`, `TenantSelector` | Sign-in pages and their building blocks | `bridge guide svelte sdk-auth` |
| `BridgeBillingRoutes`, `BridgePaywallPage`, `BridgePaywall`, `PlanSelector`, `BillingPortalButton`, `BridgeBillingNotice`, `BridgeSubscriptionStatus` | Subscription pages, paywall, plan picker, portal button, lifecycle notices, a plan/status badge | `bridge guide svelte billing` |
| `QuotaGate`, `BridgeQuotaBanner`, `BridgeUpgradeDialog` | Plan limits in the UI and the upgrade dialog | `bridge guide svelte billing` |
| `TeamManagementPanel`, `TeamUserList`, `TeamProfileForm`, `TeamWorkspaceForm`, `TeamAddUserDialog`, `TeamEditUserDialog`, `TeamConfirmDialog`, `TeamUserActionsMenu` | Members, roles, workspace settings | `bridge guide svelte team` |
| `ApiTokenManagement` | Lets a workspace create and revoke its API tokens | — |
| `FeatureFlag` | Markup behind a flag | `bridge guide svelte feature-flags` |
| `RealtimeDevBadge` | The "Live updates off — why?" badge; `<BridgeBootstrap>` already mounts it in dev builds | — |

## Checklist

- [ ] `@nebulr-group/bridge-svelte` installed; old auth packages, env vars and route config removed
- [ ] `.env` has `VITE_BRIDGE_APP_ID` (plus `VITE_BRIDGE_API_BASE_URL` for a stage or local app)
- [ ] `src/routes/+layout.ts`: `ssr = false` and `export const load = bridgeBootstrap({ rules })`, only `/auth/*` public
- [ ] `src/routes/+layout.svelte`: styles imported, app inside `<BridgeBootstrap>`, no `ready` flag of your own
- [ ] `src/routes/auth/[...bridge]/+page.svelte` renders `<BridgeAuthRoutes />`, and no other page under `src/routes/auth/` only renders a Bridge component
- [ ] Bridge app: callback URL in redirect URIs, every dev origin in allowed origins
- [ ] Calls to the app's own backend go through `bridgeFetch`

## Verify

1. The build passes with no type or import errors.
2. Signed out, a protected page redirects to the Bridge login; after signing in you land back on that page and see the user's name.
3. `/auth/login` shows the "sign-in is hosted" page; `/auth/not-a-page` shows the app's 404.
4. Bridge components render styled, not as raw HTML.
5. To prove sign-in without a browser: `bridge test-user create`, then `bridge test-user verify` with the credentials it printed.
