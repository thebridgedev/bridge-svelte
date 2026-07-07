---
title: Google / SSO
description: Standalone SSO login button for Svelte.
sidebar:
  label: Svelte
---
import { Tabs, TabItem } from '@astrojs/starlight/components';

# Google / SSO

A standalone SSO login button for a single federation connection. Use this when you want SSO buttons outside of `LoginForm`, or to build a custom login page.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `connection` | `FederationConnection` | **(required)** | The SSO connection object |
| `label` | `string` | `'Continue with {name}'` | Button label text |
| `mode` | `'redirect' \| 'popup'` | `'redirect'` | SSO kickoff strategy. See [SSO mode](#sso-mode-redirect-vs-popup). |
| `onSuccess` | `() => void` | — | Called after successful SSO login (popup mode only) |
| `onError` | `(error: Error) => void` | — | Called on error |
| `icon` | `Snippet` | — | Custom icon snippet |

**Usage:**

```svelte
<script lang="ts">
  import { SsoButton, type FederationConnection } from '@nebulr-group/bridge-svelte';

  let { connections }: { connections: FederationConnection[] } = $props();
</script>

{#each connections as connection}
  <SsoButton
    {connection}
    onSuccess={() => console.log('SSO login complete')}
    onError={(err) => console.error(err)}
  />
{/each}
```

## SSO mode: redirect vs popup

Both `LoginForm` and standalone `SsoButton` support two SSO kickoff strategies via the `ssoMode` / `mode` prop:

| Mode | What happens | When to use |
|------|--------------|-------------|
| `'redirect'` **(default)** | Clicking the button navigates the current tab to the Bridge federation endpoint. The user is sent to the provider (Google, Microsoft, etc.), signs in, and the OAuth callback chain returns them to your app via the normal route guard flow. No popup, no cross-window messaging. | Almost all apps. This is the safest, most compatible default — pop-up blockers, mobile browsers, embedded webviews, and strict CSPs all work out of the box. The route guard automatically completes the auth transition when the user lands back on a protected route. |
| `'popup'` | Clicking the button opens `window.open()` to the Bridge federation endpoint with `mode=popup`. The popup completes the provider flow and `postMessage`'s the result back to the opener, which resolves the `startSsoLogin()` promise. The host page never unloads. | Embedded widgets, multi-tab dashboards, or flows that must preserve unsaved state on the host page. Requires `targetOrigin` to match your app origin (handled automatically). Pop-up blockers may interfere — handle `onError` for the "popup blocked" case. |

**Redirect mode example:**

<Tabs>
<TabItem label="LoginForm">

```svelte
<LoginForm />
<!-- or explicitly -->
<LoginForm ssoMode="redirect" />
```

</TabItem>
<TabItem label="SsoButton">

```svelte
<SsoButton {connection} />
<!-- or explicitly -->
<SsoButton {connection} mode="redirect" />
```

</TabItem>
</Tabs>

In redirect mode, `onSuccess` / `onLogin` do **not** fire on the original page — it's already navigating away. Instead, rely on your route guard + `authState` store transitions to pick up the session once the user lands back in your app.

**Popup mode example:**

<Tabs>
<TabItem label="LoginForm">

```svelte
<LoginForm ssoMode="popup" />
```

</TabItem>
<TabItem label="SsoButton">

```svelte
<SsoButton
  {connection}
  mode="popup"
  onSuccess={() => console.log('popup auth complete')}
  onError={(err) => {
    if (err.message.includes('popup')) {
      // popup was blocked — prompt the user to allow popups
    }
  }}
/>
```

</TabItem>
</Tabs>

In popup mode, the promise returned by `startSsoLogin()` resolves with the final auth result (or rejects if the popup is blocked, closed, or times out after 5 minutes), so `onSuccess` and `onError` fire as expected.

**Under the hood:** both modes hit the same backend endpoint `GET /auth/auth/federation/:appId?provider=<type>`. Popup mode additionally sends `mode=popup&targetOrigin=<origin>` query params, which the backend uses to route the final callback into a `postMessage` instead of a normal redirect.
