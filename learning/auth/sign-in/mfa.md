---
title: MFA / 2FA
description: Enable MFA / 2FA sign-in.
sidebar:
  label: Svelte
---

# MFA / 2FA

Require a second factor — an authenticator app code, with recovery codes as backup — at login.

## Enable it

- **CLI:**

  ```bash
  bridge app update --mfa-enabled true
  ```

- **Control Center:** [Auth → Login](https://app.thebridge.dev/auth?tab=login)
- **MCP:** not yet available — coming soon.

## What you need

Nothing extra. Bridge issues and verifies the authenticator secret and recovery codes itself.

## UI components

Ready-made components handle the challenge and setup flows — see [MFA / 2FA](/auth/ui/mfa/) in UI components.
