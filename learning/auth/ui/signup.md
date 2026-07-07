# Signup

A signup form with email, full name, and password fields.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSignup` | `() => void` | — | Called after successful signup |
| `onError` | `(error: Error) => void` | — | Called on signup error |
| `showLoginLink` | `boolean` | `true` | Show a link to the login page |
| `loginHref` | `string` | `'/login'` | Login page URL |
| `heading` | `string` | `'Create your account'` | Custom heading text |
| `footer` | `Snippet` | — | Custom footer content |

**Usage:**

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { SignupForm } from '@nebulr-group/bridge-svelte';
</script>

<SignupForm
  showLoginLink
  loginHref="/auth/login"
  onSignup={() => goto('/auth/login')}
  onError={(err) => console.error(err)}
/>
```

After signup, the user receives a verification email. Once verified, they can log in.
