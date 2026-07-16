---
title: Google SSO
description: Enable Google SSO sign-in.
sidebar:
  label: Svelte
---

# Google SSO

Let users sign in with their Google account.

## Enable it

- **CLI:**

  ```bash
  bridge setup sso --provider google --client-id <id> --client-secret <secret>
  ```

- **Control Center** (your admin dashboard at app.thebridge.dev): [Auth → Login](https://app.thebridge.dev/auth?tab=login) → **Google SSO** → **Configuration**
- **MCP (AI-assistant integration):** coming soon.

Either path saves the credentials and turns the connection on. You need a Google OAuth client first; see below.

## Set up the Google side

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create (or open) an OAuth 2.0 **Web application** client. (The Control Center's Configuration dialog has a **Find your keys here** shortcut straight to this page.)
2. Under **Authorised JavaScript origins**, add Bridge's hosted auth domain: `https://auth.thebridge.dev`, or your own `hostedUrl` (the base URL for Bridge's hosted UI) if you've customized it; see the [config reference](/auth/config/#base-urls).
3. Under **Authorised redirect URIs**, add:

   ```
   https://api.thebridge.dev/auth/federated/google/return
   ```

   This is a fixed URL shared by every app on Bridge; it isn't specific to yours, and it's the same value the Control Center's Configuration dialog shows you. Always use whatever value is shown there if it differs from this.

4. Copy the **Client ID** and **Client secret** Google gives you back into Bridge, via the CLI command above or the Control Center dialog.

## UI components

A ready-made SSO button and login form both handle this. See [SSO login button](/auth/ui/google-sso/) in UI components.
