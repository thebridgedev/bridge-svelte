---
title: Magic link
description: Enable magic link sign-in.
sidebar:
  label: Svelte
---

# Magic link

Let users sign in via a one-time link emailed to them, no password needed.

## Enable it

- **CLI:**

  ```bash
  bridge app update --magic-link-enabled true
  ```

- **Control Center** (your admin dashboard at app.thebridge.dev): [Auth → Login](https://app.thebridge.dev/auth?tab=login)
- **MCP (AI-assistant integration):** coming soon.

## What you need

Nothing extra to turn it on. Magic links are delivered by email, so if you haven't already configured an email/communication provider, do that first with `bridge setup communication`.

## Where the link comes back

The emailed link returns to the page the user requested it from. `sendMagicLink` sends that page's URL (`location.origin + location.pathname` — no query string, no fragment) along with the request, and Bridge emails that URL with the sign-in token appended:

```
https://app.example.com/auth/magic-link?bridge_magic_link_token=…
```

Two things follow from that:

- **Keep the requesting route reachable**, and render either `<MagicLink />` or `<LoginForm />` on it. Both read `bridge_magic_link_token` on mount, exchange it for a session and strip it from the URL — there's nothing else to wire up.
- **The destination has to be one of your app's allowed origins.** That link carries a token that signs the user in, so Bridge refuses to email it to an address your app doesn't own. See [Allowed origins](/auth/config/#configs-managed-in-control-center) in the config reference.

Pass `successUrl` to send the user somewhere other than the page they asked from:

```svelte
<script lang="ts">
  import { getBridgeAuth } from '@nebulr-group/bridge-svelte';

  async function requestLink(email: string) {
    await getBridgeAuth().sendMagicLink(email, {
      successUrl: 'https://app.example.com/auth/finish',
    });
  }
</script>
```

That page needs to redeem the token too, so it should also render `<MagicLink />` or `<LoginForm />`.

## UI components

A ready-made request form handles this. See [Magic link](/auth/ui/magic-link/) in UI components.
