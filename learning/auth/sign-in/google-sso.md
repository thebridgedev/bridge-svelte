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

  Saves your OAuth credentials and turns the connection on. The command returns a `callbackUrl` — register it as an authorized redirect URI on the OAuth client in your Google Cloud Console.

- **Control Center:** [Auth → Login](https://app.thebridge.dev/auth?tab=login)
- **MCP:** not yet available — coming soon.

## What you need

A Google OAuth 2.0 client ID and secret. Bridge derives the redirect URI for you — you only need to register it back with Google.

## UI components

A ready-made SSO button and login form both handle this — see [SSO login button](/auth/ui/google-sso/) in UI components.
