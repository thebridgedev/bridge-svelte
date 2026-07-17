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

## UI components

A ready-made request form handles this. See [Magic link](/auth/ui/magic-link/) in UI components.
