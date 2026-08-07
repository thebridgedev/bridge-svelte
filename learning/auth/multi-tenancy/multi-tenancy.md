# Multi-tenancy

Bridge has first-class multi-tenant architecture: a user can belong to more than one **workspace** (called a *tenant* in the API, which is why identifiers like `bridge.tenant.*` and `tenantId` say tenant).

The same login credentials get a user into every workspace they belong to, but everything workspace-scoped is configured *separately* per workspace: role, plan, entitlements, quotas, and branding can all differ. The same person can be `ADMIN` in one workspace and `OWNER` in another, signing in with the exact same email and password either way.

`bridge.user.role` (see [Getting the user token](/auth/user-token/getting-the-token/)) always reflects that person's role in whichever workspace is currently active; switch workspaces and it updates to the role they hold there. Roles are assigned per workspace too, see [Assign roles to users](/auth/roles/assign-roles/).

## The active workspace

The current workspace is exposed live on the `bridge` object:

```svelte
<script lang="ts">
  import { bridge } from '@nebulr-group/bridge-svelte';

  // Each field is its own reactive store; subscribe with the $ prefix.
  const name = bridge.tenant.name;
  const id = bridge.tenant.id;
</script>

<p>Workspace: {$name} ({$id})</p>
```

`bridge.tenant.*` is kept current over the live channel (a persistent realtime connection the SDK maintains): when an admin renames the workspace or changes its plan, the values update without a reload.

## Selecting a workspace after login

When a user has **more than one enabled membership in an active tenant**, `LoginForm` surfaces a `TenantSelector` step automatically so they pick which workspace to enter. You don't wire anything; it appears when `authState` becomes `'tenant-selection'`. See [Auth states](/auth/user-token/auth-states/) for the full list of states.

Both conditions matter: a membership that's been disabled, or a workspace that isn't active (for example, suspended for non-payment), doesn't count and won't show up as an option, even though the underlying tenant-user record still exists. A user with memberships in three workspaces but only one enabled-and-active goes straight in, no selector shown.

## Switching workspaces

A drop-in `WorkspaceSelector` component lists the workspaces the signed-in user can access and switches the active one; the same enabled-and-active filter from workspace selection at login applies here too. On switch, the SDK issues a fresh session for the chosen workspace and refreshes the whole `bridge` object, including that person's role, which may not be the same in the new workspace as it was in the last one.

Props, usage, and custom row markup live on the component's own page: [Switching workspaces](/auth/ui/switching-workspaces/).

## Isolation

Workspace isolation is enforced **server-side**, not in the client:

- Every SDK request carries the active workspace's session; the backend authorizes against that workspace only. A token minted for workspace A can never read workspace B's data.
- Switching workspaces mints a fresh session for the target workspace; the client never "merges" data across workspaces.
- Feature-flag evaluation, quotas, and entitlements are all scoped to the active workspace, so the same flag key can resolve differently per workspace.

## Under the hood

- **One update on switch**: switching workspaces replaces the entire session state (user role in that workspace, subscription, entitlements, branding) in one push; reactive reads update together with no half-applied state.
- **Live workspace updates**: `tenant.updated` events keep `bridge.tenant.*` current while you stay in a workspace.
- **One source of identity**: `bridge.user` is the person; `bridge.tenant` is the workspace they're currently acting in. The pair is what every authorization decision is made against.
