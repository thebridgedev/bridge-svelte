---
title: MFA / 2FA
description: Enable MFA / 2FA sign-in.
sidebar:
  label: Svelte
---

# MFA / 2FA

Require a second factor at login: a 6-digit code sent by SMS to the user's verified phone number, with a recovery code as backup if they lose access to the phone.

## Enable it

- **CLI:**

  ```bash
  bridge app update --mfa-enabled true
  ```

- **Control Center** (your admin dashboard at app.thebridge.dev): [Auth → Login](https://app.thebridge.dev/auth?tab=login)
- **MCP (AI-assistant integration):** coming soon.

## What you need

Nothing extra in your app code. Users enroll a phone number the first time MFA is required, Bridge sends the SMS verification codes itself, and it issues and verifies the recovery code too.

## How it works

- **First sign-in after enabling:** the user is asked to set up MFA: they enter their phone number, verify the 6-digit code Bridge texts them, and save a one-time recovery code.
- **Every sign-in after that:** the user enters the 6-digit code texted to their enrolled phone, or falls back to their recovery code.

## UI components

Ready-made components handle the challenge and setup flows. See [MFA / 2FA](/auth/ui/mfa/) in UI components.
