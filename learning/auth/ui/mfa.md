# MFA / 2FA

Bridge's MFA is SMS-based: codes are 6-digit one-time codes texted to the phone number the user enrolls during setup, with a recovery code as backup. Two components cover the flow.

## MfaChallenge

Prompts the user to enter an MFA code. Appears automatically inside `LoginForm` when `authState` transitions to `'mfa-required'`. Can also be used standalone.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onVerified` | `() => void` | (none) | Called after successful MFA verification |
| `onError` | `(error: Error) => void` | (none) | Called on verification error |
| `showRecoveryOption` | `boolean` | `true` | Show the recovery code toggle |

The component supports two modes:
1. **Authentication code**: the user enters the 6-digit code texted to their enrolled phone number, with a resend option (60-second cooldown).
2. **Recovery code**: the user enters the recovery code they saved during setup instead, for example after losing their phone.

**Standalone usage:**

```svelte
<script lang="ts">
  import { MfaChallenge, authState } from '@nebulr-group/bridge-svelte';
  import { goto } from '$app/navigation';
</script>

{#if $authState === 'mfa-required'}
  <MfaChallenge
    onVerified={() => goto('/dashboard')}
    onError={(err) => console.error(err)}
  />
{/if}
```

## MfaSetup

Guides the user through a 3-step MFA setup flow: enter a phone number, verify the 6-digit code texted to it, then save the one-time recovery code. Appears automatically inside `LoginForm` when `authState` transitions to `'mfa-setup-required'`.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onComplete` | `() => void` | (none) | Called after MFA setup is complete |
| `onError` | `(error: Error) => void` | (none) | Called on setup error |

**Standalone usage:**

```svelte
<script lang="ts">
  import { MfaSetup, authState } from '@nebulr-group/bridge-svelte';
  import { goto } from '$app/navigation';
</script>

{#if $authState === 'mfa-setup-required'}
  <MfaSetup
    onComplete={() => goto('/dashboard')}
    onError={(err) => console.error(err)}
  />
{/if}
```

To turn MFA on for your app in the first place, see [MFA / 2FA](/auth/sign-in/mfa/) under Sign-in methods.
