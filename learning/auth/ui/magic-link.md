# Magic link

Standalone magic link request form. When a user clicks a magic link from their email, the token is in the URL and Bridge processes it automatically during bootstrap.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSent` | `() => void` | — | Called after the magic link email is sent |
| `onError` | `(error: Error) => void` | — | Called on error |
| `loginHref` | `string` | `'/login'` | Link back to the login page |

**Usage:**

```svelte
<!-- src/routes/auth/magic-link/+page.svelte -->
<script lang="ts">
  import { MagicLink } from '@nebulr-group/bridge-svelte';
</script>

<MagicLink
  loginHref="/auth/login"
  onSent={() => console.log('Check your email!')}
  onError={(err) => console.error(err)}
/>
```

When the user clicks the link in their email, they are brought to your app. The token URL parameter is auto-handled by Bridge bootstrap.
