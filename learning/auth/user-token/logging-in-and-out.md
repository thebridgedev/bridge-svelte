# Logout

Call `getBridgeAuth().logout()` to clear tokens. Pass `redirectTo` to stay in the app after logout:

```svelte
<script lang="ts">
  import { getBridgeAuth } from '@nebulr-group/bridge-svelte';
  import { goto } from '$app/navigation';

  async function handleLogout() {
    await getBridgeAuth().logout({ redirectTo: '/' });
  }
</script>

<button onclick={handleLogout}>Log out</button>
```

If you omit `redirectTo`, the user is redirected externally to complete logout.
