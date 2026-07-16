# How roles & privileges work

A **role** is a named set of **privileges**: scoped permission keys like `USER_READ` or `TENANT_WRITE`. Every user is assigned exactly one role per workspace (called a *tenant* in the API); the role determines what that user can do in that workspace.

Roles are fully custom to your app; you're not stuck with a fixed enum. Every app starts with:

- **`OWNER`**: required, protected, granted automatically. See [The owner role](/auth/roles/owner-role/).
- **`ADMIN`**: created by default but just a normal role; rename it, change its privileges, or delete it.

From there you can define as many roles as you need. See [Common role setups](/auth/roles/common-setups/) for a worked example, including a bespoke role for a specific client.

## Reading a user's role

The `bridge` object exposes the signed-in user's role live, reactively:

```svelte
<script lang="ts">
  import { bridge } from '@nebulr-group/bridge-svelte';

  const user = bridge.user;
</script>

{#if $user?.role === 'ADMIN'}
  <AdminPanel />
{/if}
```

`bridge.user.role` is the role's **key** (a string); it doesn't include the role's full privilege list. Privileges travel in the JWT itself rather than the frontend snapshot, so if you need finer-grained checks than "is this role X", the flag targeting attributes cover it. See [Gate features by role or privilege](/auth/roles/gate-with-flags/).

For anything that must be enforced (not just hidden in the UI), check the role or a specific privilege on your backend; never rely on a frontend role check alone for access control.
