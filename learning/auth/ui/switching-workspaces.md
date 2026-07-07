# Switching workspaces

## WorkspaceSelector

A drop-in switcher that lists the workspaces the signed-in user can access and switches the active one. On switch, the SDK re-issues a session for the chosen tenant and the whole `bridge` surface re-snapshots.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSwitch` | `() => void` | — | Called after the active workspace changes |
| `onError` | `(error: Error) => void` | — | Called on switch error |
| `workspaceItem` | `Snippet<[{ workspace, isActive, isLoading, onSelect }]>` | — | Custom render snippet per workspace row |

**Usage:**

```svelte
<script lang="ts">
  import { WorkspaceSelector } from '@nebulr-group/bridge-svelte';
  import { goto } from '$app/navigation';
</script>

<WorkspaceSelector
  onSwitch={() => goto('/')}
  onError={(err) => console.error(err)}
/>
```

**Custom row markup** — supply a `workspaceItem` snippet for full control:

```svelte
<WorkspaceSelector>
  {#snippet workspaceItem({ workspace, isActive, isLoading, onSelect })}
    <button class:active={isActive} disabled={isLoading} onclick={onSelect}>
      {workspace.tenant.name}{isActive ? ' ✓' : ''}
    </button>
  {/snippet}
</WorkspaceSelector>
```

## TenantSelector at login

When a user's credentials map to more than one tenant, `LoginForm` surfaces a `TenantSelector` step automatically so they pick which workspace to enter. You don't wire anything — it appears when `authState` becomes `'tenant-selection'`. See [Auth states](/auth/user-token/auth-states/) for the full list of states.
