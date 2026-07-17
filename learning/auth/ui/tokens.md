# Tokens

A drop-in component for managing API tokens. Renders a complete token management UI.

**Usage:**

```svelte
<!-- src/routes/settings/api-tokens/+page.svelte -->
<script lang="ts">
  import { ApiTokenManagement } from '@nebulr-group/bridge-svelte';
</script>

<ApiTokenManagement class="my-token-panel" />
```

The component provides:
- List of existing API tokens
- Create new tokens with a privilege picker (searchable)
- Revoke tokens with confirmation
- Display a new token value once after creation (show/hide/copy)
- Token expiry date display

No additional props are required. Standard `HTMLAttributes<HTMLDivElement>` props (`class`, `style`, etc.) are forwarded to the root element.

> **Tip:** the full token value is displayed exactly once, right after creation. Bridge stores only a hash, so it can never show the secret again; tell your users to copy it into a secret manager before dismissing the dialog, and to revoke and reissue if it's lost.

For what API tokens are and how scoping and revocation work, see [API tokens](/auth/api-tokens/).
