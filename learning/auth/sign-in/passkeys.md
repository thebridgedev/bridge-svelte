---
title: Passkeys
description: Enable passkey sign-in.
sidebar:
  label: Svelte
---

# Passkeys

Let users sign in with a device passkey (Face ID, Touch ID, Windows Hello, a security key) instead of a password.

## Enable it

- **CLI:**

  ```bash
  bridge app update --passkeys-enabled true
  ```

- **Control Center** (your admin dashboard at app.thebridge.dev): [Auth → Login](https://app.thebridge.dev/auth?tab=login)
- **MCP (AI-assistant integration):** coming soon.

## What you need

Nothing extra. Passkeys are WebAuthn, handled entirely by the browser and device; there are no secrets or redirect URIs to configure.

## UI components

Ready-made components handle login and setup. See [Passkeys](/auth/ui/passkeys/) in UI components.
