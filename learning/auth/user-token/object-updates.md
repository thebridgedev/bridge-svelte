---
title: How the user token is updated
description: How role, plan, and permission changes reach your app live, and what happens offline.
sidebar:
  label: Svelte
---

# How the user token is updated

Once `bridgeBootstrap()` connects, your app is subscribed to a live channel for as long as it's open. When an admin changes something about the signed-in user server-side — their role, their workspace's plan, a permission — Bridge pushes that change down the channel and refreshes the session automatically. Your reactive stores update in place. There's no reload, no polling, and nothing to wire up beyond reading `bridge.user` reactively.

## Example: a role change reaching your UI live

```svelte
<script lang="ts">
  import { bridge } from '@nebulr-group/bridge-svelte';

  const user = bridge.user;
</script>

{#if $user?.role === 'admin'}
  <AdminPanel />
{:else}
  <p>You don't have access to this area.</p>
{/if}
```

If an admin changes this user's role from `member` to `admin` in the Control Center, `$user.role` updates on its own and `<AdminPanel />` appears — no refresh, because the template is driven by the reactive `$user` store rather than a value read once on mount. Structure your gated UI this way (branch on the live store, not a snapshot you captured earlier) and it stays correct automatically.

## Reacting to the exact moment something changes

For a side effect at the moment of change — a toast, an analytics event, an audit log — subscribe on the unified events dispatcher:

```ts
import { bridge } from '@nebulr-group/bridge-svelte';

bridge.events.handle({
  'user.state_changed': (msg) => toast(`Your access changed: ${msg.reason}`),
  'session.snapshot': (msg) => console.log('Session refreshed', msg.data),
});
```

## What happens while your app is offline

If the live channel drops (network blip, laptop sleep, server restart), your stores **freeze at their last-known values** — nothing clears, nothing errors. Bridge doesn't have anything new to tell you, so it doesn't tell you anything.

When the channel reconnects, two things happen automatically:

1. Bridge proactively refreshes your tokens, in case a role/plan change was broadcast while you were disconnected and missed.
2. The server sends a fresh session snapshot, which atomically overwrites every slice (`bridge.user`, `bridge.tenant`, subscription, entitlements) in one update — so you're back in sync even if several things changed while you were offline.

You can watch the connection itself if you want to show an offline indicator:

```ts
import { realtimeStatus } from '@nebulr-group/bridge-svelte/flags';
// 'idle' | 'connecting' | 'open' | 'closed'
```
