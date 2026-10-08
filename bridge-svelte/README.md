<p align="center">
  <a href="https://thebridge.dev/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-svelte"><img src="https://raw.githubusercontent.com/thebridgedev/bridge-svelte/main/.github/assets/banner.png" alt="The Bridge for SvelteKit" width="100%"></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@nebulr-group/bridge-svelte"><img src="https://img.shields.io/npm/v/@nebulr-group/bridge-svelte?color=20006b&label=npm" alt="npm version"></a>
  <a href="https://github.com/thebridgedev/bridge-svelte/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@nebulr-group/bridge-svelte?color=20006b" alt="MIT license"></a>
  <a href="https://madewithsvelte.com/p/the-bridge/shield-link"><img src="https://madewithsvelte.com/storage/repo-shields/5996-shield.svg" alt="Made with Svelte"></a>
</p>

<p align="center">
  <a href="https://thebridge.dev/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-svelte"><b>Website</b></a> ·
  <a href="https://thebridge.dev/docs/quickstart/svelte/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-svelte"><b>Quickstart</b></a> ·
  <a href="https://thebridge.dev/docs/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-svelte"><b>Docs</b></a> ·
  <a href="https://thebridge.dev/docs/ai-assistants/mcp/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-svelte"><b>Set up with your AI assistant</b></a>
</p>

# The Bridge for SvelteKit

`@nebulr-group/bridge-svelte` adds sign-in, workspaces and roles, feature flags, Stripe subscriptions and plan limits to a SvelteKit 2 + Svelte 5 app, with one `.env` line and three files.

**[The Bridge](https://thebridge.dev/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-svelte)** is a hosted backend for SaaS apps. It gives you sign-in (passwords, magic links, passkeys, social login and SSO), multi-tenant workspaces with roles, Stripe subscriptions with plan limits, and feature flags, all managed from one dashboard. Your AI coding assistant can set it up for you through the [Bridge MCP server](https://thebridge.dev/docs/ai-assistants/mcp/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-svelte).

> **Let your AI assistant set it up.** Connect the [Bridge MCP server](https://thebridge.dev/docs/ai-assistants/mcp/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-svelte) to Claude, Cursor, Copilot or Gemini CLI and ask it to add Bridge to your app. Not using MCP? Run `npx @nebulr-group/bridge-cli guide add-login` in your project: it detects your framework from `package.json` and prints the steps for your assistant to follow. `npx @nebulr-group/bridge-cli doctor` checks the result.

## Install

```bash
npm i @nebulr-group/bridge-svelte
```

## Usage

The whole integration is one `.env` line and three files:

```env
# .env
VITE_BRIDGE_APP_ID=your-app-id
```

```ts
// src/routes/+layout.ts
import { bridgeBootstrap } from '@nebulr-group/bridge-svelte';
export const ssr = false;
export const load = bridgeBootstrap({ rules: [{ match: new RegExp('^/auth($|/)'), public: true }] });
```

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

```svelte
<!-- src/routes/auth/[...bridge]/+page.svelte — every sign-in page -->
<script lang="ts">
  import { BridgeAuthRoutes } from '@nebulr-group/bridge-svelte';
</script>
<BridgeAuthRoutes />
```

A stage or local app also sets `VITE_BRIDGE_API_BASE_URL`. Add `loginRoute: '/auth/login'` for sign-in inside the app, and `src/routes/subscription/[...bridge]/+page.svelte` rendering `<BridgeBillingRoutes />` for subscriptions.

[How Bridge works](https://github.com/thebridgedev/bridge-svelte/blob/main/learning/mechanisms.md) explains plan limits, the three UI levels and the four customisation levels; the [learning docs](https://github.com/thebridgedev/bridge-svelte/tree/main/learning) cover everything else. Coding agents: `npx @nebulr-group/bridge-cli guide svelte`.

## Learn more

- [Quickstart](https://thebridge.dev/docs/quickstart/svelte/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-svelte)
- [Authentication](https://thebridge.dev/docs/auth/svelte/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-svelte)
- [Sign-in inside your app](https://thebridge.dev/docs/sdk-auth/svelte/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-svelte)
- [Feature flags](https://thebridge.dev/docs/feature-flags/svelte/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-svelte)
- [Branding](https://thebridge.dev/docs/branding/svelte/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-svelte)
- [Live updates](https://thebridge.dev/docs/live-updates/svelte/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-svelte)
- [Subscriptions and plan limits](https://thebridge.dev/docs/billing/how-it-works/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-svelte)

## Other Bridge packages

| Package | For |
|---|---|
| [`@nebulr-group/bridge-react`](https://www.npmjs.com/package/@nebulr-group/bridge-react) | React |
| [`@nebulr-group/bridge-nextjs`](https://www.npmjs.com/package/@nebulr-group/bridge-nextjs) | Next.js |
| [`@nebulr-group/bridge-angular`](https://www.npmjs.com/package/@nebulr-group/bridge-angular) | Angular |
| [`@nebulr-group/bridge-nestjs`](https://www.npmjs.com/package/@nebulr-group/bridge-nestjs) | NestJS |
| [`@nebulr-group/bridge-express`](https://www.npmjs.com/package/@nebulr-group/bridge-express) | Express |
| [`@nebulr-group/bridge-cli`](https://www.npmjs.com/package/@nebulr-group/bridge-cli) | CLI for people and AI agents |
| [`@nebulr-group/bridge-auth-core`](https://www.npmjs.com/package/@nebulr-group/bridge-auth-core) | Any JavaScript app (core) |

## License

[MIT](https://github.com/thebridgedev/bridge-svelte/blob/main/LICENSE) © Nebulr. Built by [The Bridge](https://thebridge.dev/?utm_source=npm&utm_medium=readme&utm_campaign=bridge-svelte).
