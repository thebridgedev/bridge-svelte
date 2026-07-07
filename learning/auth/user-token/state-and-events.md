# Auth state & events

Bridge exposes the current authentication state through reactive stores, so your
UI updates automatically as the user signs in or out.

## Checking auth status

Use the reactive stores to check whether the user is authenticated:

```svelte
<script lang="ts">
  import { isAuthenticated, isLoading } from '@nebulr-group/bridge-svelte';
</script>

{#if $isLoading}
  <p>Loading...</p>
{:else if $isAuthenticated}
  <p>You are logged in!</p>
{:else}
  <p>Please log in to continue.</p>
{/if}
```
