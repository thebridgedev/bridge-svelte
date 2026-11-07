# bridge-svelte demo

A small helpdesk built on `@nebulr-group/bridge-svelte`: the reference integration, and what the Playwright suite in `../e2e` drives. It covers sign-in with the workspace choice, sign-up and its email link, password recovery, invites, sign-out and switching workspace; flag-gated routes and components; plans, checkout and the billing portal; the team panel; the server helpers (token check and "count this"); hand-off mode; and the four customisation rungs.

## Run it

It needs one setting, the issuer from your app's settings in Bridge:

```sh
PUBLIC_BRIDGE_ISSUER=https://…/identity-access/apps/<app id> bun run dev
```

`BRIDGE_APP_KEY` (server-side only) lets the API routes count usage. Add the demo's address (`http://localhost:3001`) to the app's browser addresses in Bridge, and register `http://localhost:3001/auth` as its email-links address, so links in Bridge's emails land on the demo's pages.

## The files an app writes

| File | What it does |
|---|---|
| `src/routes/+layout.ts` | `bridgeBootstrap({ rules })`: the client and the route guard |
| `src/routes/+layout.svelte` | the stylesheet and `<BridgeBootstrap>` |
| `src/routes/auth/[...bridge]/+page.svelte` | every sign-in page |
| `src/routes/subscription/[...bridge]/+page.svelte` | every billing page |
| `src/routes/settings/team/+page.svelte` | the team panel |
| `src/hooks.server.ts` | the server-side token check |

The rest (`custom/`, `framed/`, `headless/`, `api/exports`) shows the customisation rungs and a plan-limit refusal.
