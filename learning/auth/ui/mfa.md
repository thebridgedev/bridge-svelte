# MFA / 2FA

## MfaChallenge

Prompts the user to enter an MFA code. Appears automatically inside `LoginForm` when `authState` transitions to `'mfa-required'`. Can also be used standalone.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onVerified` | `() => void` | — | Called after successful MFA verification |
| `onError` | `(error: Error) => void` | — | Called on verification error |
| `showRecoveryOption` | `boolean` | `true` | Show the recovery code toggle |

The component supports two modes:
1. **Auth code** — the user enters a 6-digit code from their authenticator app.
2. **Recovery code** — the user enters a backup recovery code.

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

Guides the user through a 3-step MFA setup flow: enter phone number, verify code, save backup codes. Appears automatically inside `LoginForm` when `authState` transitions to `'mfa-setup-required'`.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onComplete` | `() => void` | — | Called after MFA setup is complete |
| `onError` | `(error: Error) => void` | — | Called on setup error |

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
