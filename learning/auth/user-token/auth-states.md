---
title: Auth states
description: Every state a signed-in (or signing-in) user can be in, and how to branch on it.
sidebar:
  label: Svelte
---

# Auth states

`authState` is a single reactive store that tells you exactly where a user is in the login flow — from "not signed in" through any in-progress step, to fully authenticated. It's what drives `LoginForm`'s multi-step behavior (MFA, tenant selection, etc.) automatically, and you can read the same store yourself to build custom flows.

## The states

| State | Meaning |
|-------|---------|
| `'unauthenticated'` | No valid tokens — the user isn't signed in |
| `'credentials-validated'` | Email/password (or equivalent) passed; Bridge is deciding whether MFA or tenant selection is needed next |
| `'mfa-required'` | An MFA code challenge is pending |
| `'mfa-setup-required'` | The user must set up MFA before continuing (first-time enrollment) |
| `'tenant-selection'` | The user has access to more than one workspace and needs to pick one |
| `'authenticated'` | Fully signed in with valid tokens — the user can use the app |

Any state returns to `'unauthenticated'` on logout or if the tokens are cleared.

## Branching on it yourself

`LoginForm` handles all of this internally, so you only need this if you're building a custom login screen instead of using the drop-in component:

```svelte
<script lang="ts">
  import { authState, MfaChallenge, MfaSetup, TenantSelector } from '@nebulr-group/bridge-svelte';
</script>

{#if $authState === 'unauthenticated'}
  <p>Please sign in.</p>
{:else if $authState === 'credentials-validated'}
  <p>Checking your account…</p>
{:else if $authState === 'mfa-required'}
  <MfaChallenge onVerified={() => {}} />
{:else if $authState === 'mfa-setup-required'}
  <MfaSetup onComplete={() => {}} />
{:else if $authState === 'tenant-selection'}
  <TenantSelector />
{:else if $authState === 'authenticated'}
  <p>You're in.</p>
{/if}
```

## Checking just "am I logged in"

For the common case — gating a route or showing/hiding a nav item — you don't need the full state machine, just whether it resolved to `'authenticated'`. The `isAuthenticated` / `isLoading` stores cover that:

```svelte
<script lang="ts">
  import { isAuthenticated, isLoading } from '@nebulr-group/bridge-svelte';
</script>

{#if $isLoading}
  <p>Loading...</p>
{:else if $isAuthenticated}
  <p>You are logged in!</p>
{:else}
  <p>Please log in to continue.</p>
{/if}
```
