# Multi-tenancy

Every Bridge user belongs to one or more **workspaces** (tenants). The active workspace scopes everything the SDK sees — team members, subscription, quotas, entitlements, feature-flag attributes, and branding all resolve against it. A user with access to several workspaces can switch between them, and the whole `bridge` surface re-snapshots for the new tenant.

## The active tenant

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

## Isolation

Tenant isolation is enforced **server-side**, not in the client:

- Every SDK request carries the active workspace's session; the backend authorizes against that tenant only. A token minted for workspace A can never read workspace B's data.
- Switching workspace mints a fresh session for the target tenant — the client never "merges" data across tenants.
- Feature-flag evaluation, quotas, and entitlements are all scoped to the active tenant, so the same flag key can resolve differently per workspace.

## Under the hood

- **Re-snapshot on switch** — switching workspace replaces the entire session snapshot (user role in that tenant, subscription, entitlements, branding) in one push; reactive reads update together with no half-applied state.
- **Live tenant updates** — `tenant.updated` events keep `bridge.tenant.*` current while you stay in a workspace.
- **One source of identity** — `bridge.user` is the person; `bridge.tenant` is the workspace they're currently acting in. The pair is what every authorization decision is made against.
