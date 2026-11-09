# Quickstart

`@nebulr-group/bridge-svelte` puts The Bridge into a SvelteKit app: sign-in, sign-up and password pages in your own app, workspaces, flags and route guards, plans and checkout, the team panel, and live updates. It needs one setting, the issuer.

This is the 1.0 alpha. It runs in the browser (`ssr = false`) and signs people in with email and password. Other sign-in methods join later without changes to your code.

## 1. Install

```sh
bun add @nebulr-group/bridge-svelte@alpha
```

## 2. Set the issuer

Copy the issuer from your app's settings in Bridge into `.env`:

```sh
PUBLIC_BRIDGE_ISSUER=https://…/identity-access/apps/<your app id>
```

The issuer must be an `https` address. Only on your own machine may it be `http://localhost`.

In your app's settings in Bridge, also add:

- your app's address (`https://app.example.com`, and `http://localhost:5173` while developing) as a **browser address**, so your pages may call Bridge;
- `https://app.example.com/auth` as the **email-links address**, so links in Bridge's emails (finishing sign-up, resetting a password, invites) land on your sign-in pages.

## 3. Write three files

```ts
// src/routes/+layout.ts
import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';

export const ssr = false;
export const load = bridgeBootstrap({
  rules: [{ match: '/', public: true }],
});
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import '@nebulr-group/bridge-svelte/styles';
  import { BridgeBootstrap } from '@nebulr-group/bridge-svelte';
  let { children } = $props();
</script>

<BridgeBootstrap>{@render children()}</BridgeBootstrap>
```

```svelte
<!-- src/routes/auth/[...bridge]/+page.svelte -->
<script lang="ts">
  import { BridgeAuthRoutes } from '@nebulr-group/bridge-svelte';
</script>

<BridgeAuthRoutes />
```

Every page is now protected except `/`, and `/auth/sign-in`, `/auth/sign-up` and the other sign-in pages work. A visitor who opens a protected page is sent to sign-in and comes back to it afterwards.

## What to read next

- [Sign-in pages](../sign-in/sign-in.md): each page, the workspace choice, email links, sign-out, and the language.
- [Flags and route guards](../flags/flags.md): gating pages, links and buttons.
- [Billing](../billing/billing.md): plans, checkout, the portal, and plan limits.
- [The team panel](../team/team.md).
- [Your server](../server/server.md): checking tokens, flags and counting usage in `hooks.server.ts` and `+server.ts`.
- [Live updates](../live-updates/live-updates.md).
- [Theming](../theming/theming.md): making Bridge's pages look like your app.
- [Hand-off mode](../handoff/handoff.md): a sign-in page for a command-line tool.

## All settings

```ts
bridgeBootstrap({
  issuer,                 // default: PUBLIC_BRIDGE_ISSUER
  rules,                  // route rules, first match wins
  defaultAccess,          // 'protected' (default) or 'public' for routes no rule matches
  auth: { base, afterSignIn, afterSignOut }, // '/auth', '/', the sign-in page
  returnToParam,          // 'redirectUri'
  locale, messages,       // the language, and your own wording
  tokenOrigins,           // other origins your API runs on, for bridgeFetch
  live,                   // true
  storage,                // 'local' (default) or 'memory': see below
  hints,                  // values flag rules may read, such as a country
  flags: { billingManage, teamManage, appActive }, // the flags Bridge's own screens gate on
  billing: { base, paywall, upgradeDialog },       // '/subscription', its plan page, true
  handoff,                // off; see Hand-off mode
});
```

## Keeping nothing in the browser's storage

By default the session is kept in `localStorage`, so a reload and a new tab stay signed in. With `storage: 'memory'`, nothing of Bridge's is written to `localStorage` or `sessionStorage`: the session, a sign-up in progress and the visitor id stay in the page's memory. A reload signs in again. A new tab is signed in by another open tab of the app, passed in memory only; with no other tab open, it signs in again.

```ts
export const load = bridgeBootstrap({ storage: 'memory' });
```

A sign-up's email link opens in a new tab. In memory mode that tab hands the link to the tab that started the sign-up, which finishes there, and the new tab says to go on in the other window. If that tab was closed, the link says to open it where the sign-up started; it stays usable.

SvelteKit itself keeps scroll positions in `sessionStorage` (`sveltekit:*`). Those hold nothing of Bridge's.

