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

> `<BridgeAuthRoutes>` already serves this page at `/auth/set-password/[token]` (see the [in-app quickstart](/sdk-auth/sdk-quickstart/)). The example below is for taking the page over; a file at that address wins over the catch-all.

Signup verification and password-reset emails both link there.

```svelte
<!-- src/routes/auth/set-password/[token]/+page.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { ForgotPassword } from '@nebulr-group/bridge-svelte';
  import { goto } from '$app/navigation';

  const token = $derived($page.params.token ?? '');
</script>

<ForgotPassword
  {token}
  loginHref="/auth/login"
  onComplete={() => goto('/auth/login')}
/>
```
