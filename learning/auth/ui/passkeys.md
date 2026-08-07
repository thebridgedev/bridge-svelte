# Passkeys

Passkey (WebAuthn) authentication lets users sign in with a biometric or device
credential instead of a password. Requires `@simplewebauthn/browser` as a peer
dependency.

## PasskeyLogin

A button that triggers passkey authentication via the browser's WebAuthn API.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onLogin` | `() => void` | (none) | Called after successful passkey login |
| `onError` | `(error: Error) => void` | (none) | Called on error |
| `onSetupPasskey` | `() => void` | (none) | Called when the user wants to set up a passkey instead |
| `autofill` | `boolean` | `false` | Use WebAuthn conditional UI (autofill) |

```svelte
<script lang="ts">
  import { PasskeyLogin } from '@nebulr-group/bridge-svelte';
  import { goto } from '$app/navigation';
</script>

<PasskeyLogin
  onLogin={() => goto('/dashboard')}
  onError={(err) => console.error(err)}
/>
```

## PasskeySetup

Registers a new passkey using a setup token (emailed to the user).

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `token` | `string` | **(required)** | The setup token from the URL |
| `onComplete` | `() => void` | (none) | Called after passkey registration |
| `onError` | `(error: Error) => void` | (none) | Called on error |
| `onBack` | `() => void` | (none) | Called when user clicks back |
| `onExpired` | `() => void` | (none) | Called when the token has expired |

```svelte
<!-- src/routes/auth/passkey-setup/+page.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { PasskeySetup } from '@nebulr-group/bridge-svelte';
  import { goto } from '$app/navigation';

  const token = $derived($page.url.searchParams.get('token') ?? '');
</script>

<PasskeySetup
  {token}
  onComplete={() => goto('/auth/login')}
  onExpired={() => goto('/auth/login')}
/>
```

## PasskeyRequestSetupLink

An email form that requests a passkey setup link be sent to the user.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `initialEmail` | `string` | `''` | Pre-filled email address |
| `onBack` | `() => void` | **(required)** | Called when user clicks back |

```svelte
<script lang="ts">
  import { PasskeyRequestSetupLink } from '@nebulr-group/bridge-svelte';
</script>

<PasskeyRequestSetupLink
  initialEmail="user@example.com"
  onBack={() => console.log('Back to login')}
/>
```
