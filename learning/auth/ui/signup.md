# Signup

A signup form with email, first name, and last name fields. There is no password step here: the user activates the account through the verification email, then signs in with whichever method your app enables.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSignup` | `() => void` | (none) | Called after successful signup |
| `onError` | `(error: Error) => void` | (none) | Called on signup error |
| `showLoginLink` | `boolean` | `true` | Show a link to the login page |
| `loginHref` | `string` | `'/login'` | Login page URL |
| `heading` | `string` | `'Create your account'` | Custom heading text |
| `footer` | `Snippet` | (none) | Custom footer content |

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

After signup, the user receives a verification email. Once verified, they can sign in.

> **Tip:** tell Bridge where this page lives with the `signupRoute` config option (default `/auth/signup`); `LoginForm`'s signup link points there unless you override it with `signupHref`. See the [config reference](/auth/config/#all-config-options).
