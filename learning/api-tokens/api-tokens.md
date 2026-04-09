# API Token Management

### ApiTokenManagement

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
