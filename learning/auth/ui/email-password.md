---
title: Email & password
description: Bridge email & password login for Svelte.
sidebar:
  label: Svelte
---

# Email & password

A complete login form with email/password fields. Handles multi-step auth flows inline: forgot password, magic link, passkey login, MFA challenge, MFA setup, and workspace selection all appear automatically within the same component when the auth state requires them.

**Usage:**

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { LoginForm } from '@nebulr-group/bridge-svelte';
</script>

<LoginForm
  showSignupLink
  signupHref="/auth/signup"
  showForgotPassword
  showMagicLink
  showPasskeys
  onLogin={() => goto('/dashboard')}
  onError={(err) => console.error(err)}
/>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `showSignupLink` | `boolean` | `false` | Show a link to the signup page |
| `signupHref` | `string` | `'/signup'` | Signup page URL |
| `showForgotPassword` | `boolean` | `true` | Show the forgot password link |
| `forgotPasswordHref` | `string` | `undefined` | External forgot password URL. If set, navigates there instead of showing the inline form |
| `showMagicLink` | `boolean` | `true` | Show the magic link login option |
| `showPasskeys` | `boolean` | `false` | Show the passkey login button |
| `onLogin` | `() => void` | (none) | Called after successful login (all steps complete) |
| `onError` | `(error: Error) => void` | (none) | Called on any login error |
| `onSsoClick` | `(connectionType: string) => void` | (none) | Called when an SSO button is clicked |
| `heading` | `string` | `''` | Custom heading text |
| `ssoConnections` | `FederationConnection[]` | `[]` | SSO connections to display (a federation connection is an SSO identity provider configured for your app, e.g. Google or Azure AD). Auto-derived from app config if not set |
| `ssoMode` | `'redirect' \| 'popup'` | `'redirect'` | SSO kickoff strategy for the built-in buttons. See [SSO mode](/auth/ui/google-sso/#sso-mode-redirect-vs-popup). Ignored when `onSsoClick` is provided. |
| `footer` | `Snippet` | (none) | Custom footer content (Svelte 5 snippet) |

**Auth state transitions:** After a successful email/password login, the `LoginForm` checks the resulting auth state. If MFA is required, it automatically shows `MfaChallenge`. If MFA setup is required, it shows `MfaSetup`. If workspace selection is needed (multi-workspace user), it shows `TenantSelector`. The `onLogin` callback fires only after all steps are complete and the user is fully authenticated.
