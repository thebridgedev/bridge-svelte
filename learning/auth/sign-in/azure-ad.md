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

- **Control Center:** [Auth → Login](https://app.thebridge.dev/auth?tab=login) → **Azure AD SSO** → **Configuration**
- **MCP:** not yet available — coming soon.

Either path saves the credentials and turns the connection on. You need an Azure AD app registration first — see below.

## Set up the Azure side

1. In the [Azure Portal](https://portal.azure.com/), create (or open) an **App registration**.
2. Under **Authentication → Redirect URIs**, add a **Web** platform redirect URI:

   ```
   https://api.thebridge.dev/auth/federated/ms-azure-ad/return
   ```

   This is a fixed URL shared by every app on Bridge — it isn't specific to yours, and it's the same value the Control Center's Configuration dialog shows you. Always use whatever value is shown there if it differs from this.

3. Under **Certificates & secrets**, create a new client secret.
4. Copy the **Application (client) ID** and the secret **value** back into Bridge — via the CLI command above, or the Control Center dialog.

## UI components

The same SSO button and login form used for Google SSO work here too — see [SSO login button](/auth/ui/google-sso/) in UI components.
