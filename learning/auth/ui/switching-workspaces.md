# Switching workspaces

Two components cover workspace selection (a workspace is called a *tenant* in the API, which is why some identifiers below say `tenant`):

- **`TenantSelector`**: part of the login flow. Lets a user pick which workspace to sign in to.
- **`WorkspaceSelector`**: for an already signed-in user. Lets them switch the active workspace, for example from a settings page or sidebar.

Both only come into play when the user has **more than one enabled membership in an active tenant**. A membership that's been disabled, or a workspace that isn't active (for example, suspended for non-payment), doesn't count and won't be shown. A user with exactly one enabled-and-active membership goes straight in with no selector.

## TenantSelector

Lets a user with multiple workspaces pick one during login. It appears automatically inside `LoginForm` when `authState` becomes `'tenant-selection'` (see [Auth states](/auth/user-token/auth-states/)), so you normally don't wire anything. Use it standalone only if you're building a custom login flow.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSelect` | `() => void` | (none) | Called after a workspace is selected |
| `onError` | `(error: Error) => void` | (none) | Called on error |
| `tenantItem` | `Snippet<[TenantUser]>` | (none) | Custom render snippet for each workspace item |

**Standalone usage with a custom item:**

```svelte
<script lang="ts">
  import { TenantSelector, authState, type TenantUser } from '@nebulr-group/bridge-svelte';
  import { goto } from '$app/navigation';
</script>

{#if $authState === 'tenant-selection'}
  <TenantSelector onSelect={() => goto('/dashboard')}>
    {#snippet tenantItem(tenant: TenantUser)}
      <div class="tenant-card">
        <strong>{tenant.tenantName}</strong>
        <span>{tenant.role}</span>
      </div>
    {/snippet}
  </TenantSelector>
{/if}
```

## WorkspaceSelector

A drop-in switcher that lists the workspaces the signed-in user can access and switches the active one. On switch, the SDK issues a fresh session for the chosen workspace and refreshes the whole `bridge` object in one update, including the user's role, which may differ in the new workspace.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSwitch` | `() => void` | (none) | Called after the active workspace changes |
| `onError` | `(error: Error) => void` | (none) | Called on switch error |
| `workspaceItem` | `Snippet<[{ workspace, isActive, isLoading, onSelect }]>` | (none) | Custom render snippet per workspace row |

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

**Custom row markup**: supply a `workspaceItem` snippet for full control. The `workspace` object carries the workspace's details under `workspace.tenant` (`id`, `name`, `logo`), plus the membership's `id`, `username`, and `fullName`:

```svelte
<WorkspaceSelector>
  {#snippet workspaceItem({ workspace, isActive, isLoading, onSelect })}
    <button class:active={isActive} disabled={isLoading} onclick={onSelect}>
      {workspace.tenant.name}{isActive ? ' ✓' : ''}
    </button>
  {/snippet}
</WorkspaceSelector>
```

For the concept behind all of this (what a workspace is, how isolation works), see [Multi-tenancy](/auth/multi-tenancy/).
