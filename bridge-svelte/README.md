
## @nebulr-group/bridge-svelte

[![MadeWithSvelte.com shield](https://madewithsvelte.com/storage/repo-shields/5996-shield.svg)](https://madewithsvelte.com/p/the-bridge/shield-link)


Bridge Svelte library. Add Bridge auth, feature flags, and payments to your SvelteKit 2 + Svelte 5 apps.

### Install

```bash
npm i @nebulr-group/bridge-svelte
```

### Usage

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

### Build


```bash
npm run build
```

Artifacts are emitted to `dist/` via `svelte-package`.

### Release (branch-protected main)

```bash
# 1) Create release branch
git checkout -b release/v0.1.0-beta.1
git push -u origin release/v0.1.0-beta.1

# 2) Open a PR: release/v0.1.0-beta.1 -> main, approve and merge

# 3) After merge to main, tag and push
git checkout main && git pull
git tag v0.1.0-beta.1
git push origin v0.1.0-beta.1

# 4) Monitor GitHub Actions "Publish to npm"
```

### Commit signing (required)

Ensure your commits are verified before opening PRs:

```bash
# Option A: SSH signing (recommended)
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true

# Option B: GPG signing
gpg --full-generate-key
gpg --list-secret-keys --keyid-format=long
git config --global user.signingkey <KEY_ID>
git config --global commit.gpgsign true
```

### License
MIT © thebridgedev
