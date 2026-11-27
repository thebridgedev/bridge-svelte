# Bridge SvelteKit Integration (bridge-svelte 1.0)

You are adding The Bridge to a SvelteKit application with `@nebulr-group/bridge-svelte` 1.0. The whole integration is one setting, the issuer, and three small files. Sign-in happens inside the app: the sign-in, sign-up and password pages render in the app's own layout, and the plugin serves every one of them itself.

For the topics beyond setup: `bridge guide svelte sdk-auth` (sign-in pages), `bridge guide svelte feature-flags`, `bridge guide svelte billing`, `bridge guide svelte team`, `bridge guide svelte branding` (the look). With the MCP server: `get_integration_guide` with the same topic and `framework=svelte`.

## The one rule for app code

**Every gate in app code is a flag.** A link, a page, a button, an endpoint: if some people get it and others do not, the code asks a flag, and the flag's rule says why: a privilege (`privileges contains users:write`), a plan feature (`bridge:billing.entitlement.analytics eq true`) or a rollout. App code never reads a role, a privilege list, the plan or a plan feature to decide what someone may see or do.

Two things are not gates and are not flags: **numbers** are plan limits (`<QuotaGate>` in the browser, `meter()` and Bridge's refusal on the server), and **permission on one specific record** stays in app code ("only the author edits their post").

Before calling the work done, run `npx @nebulr-group/bridge-cli@alpha check gates` in the project. It lists every direct role, privilege, plan or plan-feature check with the flag to use instead. Fix each one.

In SvelteKit: a piece of UI is `<FeatureFlag key="…">`; a page is a route rule `{ match: '/admin/*', featureFlag: 'admin-area', redirectTo: '/' }`; a nav link is the same `<FeatureFlag>` around the link. The browser shows or hides; your server enforces with `@nebulr-group/bridge-svelte/server` (or the backend plugin) on every call.

## 1. Install (1.0 is in alpha)

```bash
bun add @nebulr-group/bridge-svelte@alpha
```

Use the project's package manager (`pnpm add`, `yarn add`, `npm i` with the same `@alpha` tag). Never install from `latest`: the 0.x line talks to the old Bridge and fails against this one. Nothing else to install; the plugin brings `@nebulr-group/bridge-auth-core` with it.

## 2. The one setting: the issuer, and the app's addresses

From a terminal, in the project root, with CLI 1.0 (`npm i -g @nebulr-group/bridge-cli@alpha`, then `bridge auth login` and `bridge app use <id>`):

```bash
bridge app setup --url http://localhost:5173
```

It writes `PUBLIC_BRIDGE_ISSUER=<the app's issuer>` into `.env`, and adds `http://localhost:5173` as the app's **browser-origin** address and `http://localhost:5173/auth` as its **email-links** address, so the pages may call Bridge and the links in Bridge's emails (finishing sign-up, resetting a password, invites) land on the app's own sign-in pages. Use the real dev port. Production addresses later:

```bash
bridge app address add https://app.example.com --use browser-origin
bridge app address add https://app.example.com/auth --use email-links
bridge app address list
```

With the MCP server instead: `get_environment_info` gives the `issuer`; `update_app` with `allowedOrigins` (it replaces the whole list: pass the existing origins from `get_app` plus the new one) and `uiUrl` (the email-links address, `https://<app>/auth`).

```env
# .env
PUBLIC_BRIDGE_ISSUER=https://…/identity-access/apps/<app id>
```

There is no app id setting and no API base URL: the plugin reads every endpoint from the issuer. The issuer must be `https`, except `http://localhost` on the developer's machine.

**SvelteKit 3** reads an environment variable only when the app declares it:

```ts
// src/env.ts (SvelteKit 3 only)
import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
  PUBLIC_BRIDGE_ISSUER: { public: true },
});
```

SvelteKit 2 reads `.env` as it is. Either way you may pass `issuer` to `bridgeBootstrap()` yourself instead.

## 3. The three files

**`src/routes/+layout.ts`**:

```ts
import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';

export const ssr = false;

export const load = bridgeBootstrap({
  rules: [{ match: '/', public: true }],
});
```

**`src/routes/+layout.svelte`**:

```svelte
<script lang="ts">
  import '@nebulr-group/bridge-svelte/styles';
  import { BridgeBootstrap } from '@nebulr-group/bridge-svelte';

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

- **`ssr = false`** is required: Bridge runs in the browser.
- **Everything is protected by default** (`defaultAccess: 'protected'`). The sign-in pages under `auth.base` (`/auth`) are always reachable; open other pages with `public: true` rules. A signed-out visitor on a protected page goes to `/auth/sign-in?redirectUri=…` and comes back to that page afterwards.
- **`<BridgeBootstrap>`** renders the app once Bridge is ready, starts flags and Live updates, follows the email links, and renders the "Confirm it is you" and upgrade dialogs. Write no ready-state logic of your own; put navigation and the shell inside it.
- **The styles import** gives Bridge's components their structure and default look. Keep it, also with Tailwind or a component library, and make it match the app with `--bridge-*` tokens (step 5).
- **The `[...bridge]` file** serves every sign-in page: `/auth/sign-in`, `/auth/sign-up`, `/auth/verify-email`, `/auth/forgot-password`, `/auth/set-password`, `/auth/invite`, `/auth/workspaces`, `/auth/magic-link`, `/auth/passkey-setup`. Any other address under `/auth` gets the app's own 404.

**Route rules.** `match` is an exact path, a path with `*` (`'/docs/*'`) or a `RegExp`; the first match wins. `public: true` opens a page to visitors. `featureFlag: 'key'` (or `{ any: [...] }` / `{ all: [...] }`) with `redirectTo` closes a page while the flag is off. Adding a flag to a path that already has a rule is an edit of that rule, not a new one.

## 4. Signed in, signing out, calling your API

```svelte
<script lang="ts">
  import { signedIn, user, workspace, ProfileName, SignOutButton } from '@nebulr-group/bridge-svelte';
</script>

{#if $signedIn}
  <a href="/auth/workspaces">{$workspace?.name}</a>
  <ProfileName />
  <SignOutButton />
{:else}
  <a href="/auth/sign-in">Sign in</a>
{/if}
```

| You need | Use |
|---|---|
| Signed in? | `$signedIn` |
| The person | `$user` (`{ id, email, emailVerified }` or `null`), `$me` for the profile (`{ value, loading, error }`) |
| The workspace | `$workspace` (`{ id, name, logo, role, standing }` or `null`), `$workspaces` for the list |
| The whole session | `$session` (`loading`, `signed-out` with a reason, `signed-in`) |
| Whether someone gets a feature | a flag: `<FeatureFlag key>`, `useFlag(key)`, or a route rule with `featureFlag` (`bridge guide svelte feature-flags`) |
| How much of a limit is left | `useQuota(metric)`, `<QuotaGate metric>` (`bridge guide svelte billing`) |
| The Bridge client, for your own screens | `getBridge()` |

`$workspace.role` is there to show, never to gate: gate on a flag.

Call the app's own API with `bridgeFetch`: it is `fetch` with the person's token and one refresh after a `401`, and it opens the upgrade dialog when the API refuses at a plan limit with a `402`. It sends the token only to the page's own origin, Bridge, and `tokenOrigins` you list (`bridgeBootstrap({ tokenOrigins: ['https://api.example.com'] })`). Do not write a `fetchWithAuth` helper.

```ts
import { bridgeFetch } from '@nebulr-group/bridge-svelte';

const res = await bridgeFetch('/api/projects', { method: 'POST', body: JSON.stringify(input) });
```

The server side of that call checks the token: `bridgeHandle` in `src/hooks.server.ts` from `@nebulr-group/bridge-svelte/server` (`bridge guide svelte feature-flags`, "On your server"), or a NestJS backend with `@nebulr-group/bridge-nestjs@alpha` (`bridge guide nestjs`).

## 5. The look

The added pages must look like the rest of the app, not like Bridge's defaults. Read `bridge guide svelte branding` and do what it says: read the app's own styling and set the matching `--bridge-*` tokens in the app's stylesheet. Skip it only when the developer asks for Bridge's default look, or the app has no styling of its own (then say so in one line).

## Everything else the package exports

Reach for these before writing an equivalent; each is imported from `@nebulr-group/bridge-svelte`.

| Component | Does | Guide |
|---|---|---|
| `BridgeAuthRoutes`, `SignInForm`, `SignUpForm`, `VerifyEmail`, `ForgotPassword`, `SetPassword`, `InviteLanding`, `WorkspaceChooser`, `MagicLinkLanding`, `PasskeySetupLanding`, `PasskeyManager`, `SocialButtons`, `SecondStepForm`, `SignOutButton`, `ProfileName` | Sign-in pages and their parts | `bridge guide svelte sdk-auth` |
| `BridgeBillingRoutes`, `PlanPicker`, `CurrentPlan`, `BillingPortalButton`, `SubscriptionStatus`, `BillingNotice`, `CheckoutNotice`, `QuotaBanner`, `QuotaGate`, `UpgradeDialog` | Plans, checkout, the portal, notices and plan limits | `bridge guide svelte billing` |
| `TeamPanel`, `MemberList`, `InviteList`, `InviteDialog`, `EditMemberDialog`, `ConfirmDialog`, `WorkspaceForm`, `ProfileForm` | Members, invites, roles, the workspace and the profile | `bridge guide svelte team` |
| `FeatureFlag` | Markup behind a flag | `bridge guide svelte feature-flags` |
| `LiveStatusBadge` | Whether Live updates are connected, for development builds | — |

## Checklist

- [ ] `@nebulr-group/bridge-svelte@alpha` installed; old auth packages and their settings removed
- [ ] `.env` has `PUBLIC_BRIDGE_ISSUER` and nothing else of Bridge's (and `src/env.ts` declares it on SvelteKit 3)
- [ ] `bridge app address list` shows the dev origin as `browser-origin` and `<origin>/auth` as `email-links`
- [ ] `src/routes/+layout.ts`: `ssr = false` and `export const load = bridgeBootstrap({ rules })`
- [ ] `src/routes/+layout.svelte`: styles imported, the app inside `<BridgeBootstrap>`, no ready flag of your own
- [ ] `src/routes/auth/[...bridge]/+page.svelte` renders `<BridgeAuthRoutes />`
- [ ] The look follows the app (`bridge guide svelte branding`)
- [ ] Calls to the app's own API go through `bridgeFetch`
- [ ] `npx @nebulr-group/bridge-cli@alpha check gates` is clean

## Verify

Run the terminal checks. If you have a browser tool, run the browser checks too. If you do not, list them for the developer, numbered, and start the summary with a Heads up line saying which checks were not run.

### Terminal checks

1. The build passes with no type or import errors.
2. `npx @nebulr-group/bridge-cli@alpha check gates` lists nothing.
3. `bridge app get` and `bridge app address list` show the issuer and addresses the project uses.

### Browser checks

1. Signed out, a protected page sends you to `/auth/sign-in` in the app; after signing in you land back on that page.
2. Sign up once at `/auth/sign-up` with a real address and open the email's link: it lands on the app's `/auth` page and signs you in. Do not create test users.
3. Sign out with `<SignOutButton>`: you land on the sign-in page. `/auth/not-a-page` shows the app's 404.
4. Bridge's pages render styled and look like the rest of the app.

If a sign-in step fails, `bridge event auth-attempts --user <their email>` (MCP: `debug_auth_issue`) names the reason. When a check was not run, the summary starts with "Heads up: not verified in a browser" and lists them.
