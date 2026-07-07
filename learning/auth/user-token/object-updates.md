# How the user object is updated

The current workspace is exposed live on the unified `bridge` surface:

```svelte
<script lang="ts">
  import { bridge } from '@nebulr-group/bridge-svelte';

  // Each slice is its own reactive store — subscribe with the $ prefix.
  const name = bridge.tenant.name;
  const id = bridge.tenant.id;
</script>

<p>Workspace: {$name} ({$id})</p>
```

`bridge.tenant.*` is kept current over the live channel — when an admin renames the workspace or changes its plan, the values update without a reload.
