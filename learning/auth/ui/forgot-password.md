# Forgot / reset password

Dual-mode component:
1. **Request mode** (no `token` prop): shows an email form to request a password reset link.
2. **Reset mode** (`token` prop set): shows a new password form to complete the reset.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `token` | `string` | (none) | Reset token from URL. When set, shows the new password form |
| `onComplete` | `() => void` | (none) | Called after the email is sent (request mode) or password is reset (reset mode) |
| `onError` | `(error: Error) => void` | (none) | Called on error |
| `loginHref` | `string` | `'/login'` | Link back to the login page |

**Request page:**

```svelte
<!-- src/routes/auth/forgot-password/+page.svelte -->
<script lang="ts">
  import { ForgotPassword } from '@nebulr-group/bridge-svelte';
</script>

<ForgotPassword
  loginHref="/auth/login"
  onComplete={() => console.log('Reset email sent')}
/>
```

**Reset page (with token from URL):**

```svelte
<!-- src/routes/auth/reset-password/+page.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { ForgotPassword } from '@nebulr-group/bridge-svelte';
  import { goto } from '$app/navigation';

  const token = $derived($page.url.searchParams.get('token') ?? '');
</script>

<ForgotPassword
  {token}
  loginHref="/auth/login"
  onComplete={() => goto('/auth/login')}
/>
```
