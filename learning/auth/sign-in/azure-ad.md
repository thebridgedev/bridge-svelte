---
title: Azure AD SSO
description: Enable Azure AD SSO sign-in.
sidebar:
  label: Svelte
---

# Azure AD SSO

Let users sign in with their Microsoft / Azure AD account.

## Enable it

- **CLI:**

  ```bash
  bridge setup sso --provider azure --client-id <id> --client-secret <secret>
  ```

  Saves your OAuth credentials and turns the connection on. The command returns a `callbackUrl` — register it as a redirect URI on the app registration in your Azure portal.

- **Control Center:** [Auth → Login](https://app.thebridge.dev/auth?tab=login)
- **MCP:** not yet available — coming soon.

## What you need

An Azure AD app registration's client ID and secret. Bridge derives the redirect URI for you — you only need to register it back with Azure.

## UI components

The same SSO button and login form used for Google SSO work here too — see [SSO login button](/auth/ui/google-sso/) in UI components.
