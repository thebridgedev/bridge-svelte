# The owner role

Every tenant has an `OWNER` role, and Bridge enforces some rules around it that you'll want to know before you hit them:

- **Every tenant must have at least one owner.** Whoever creates a tenant becomes its first `OWNER` automatically.
- **You can't demote the last owner.** Changing a user's role away from `OWNER` is blocked if they're the only owner left in the tenant — the API rejects it with "There must be at least one owner for this workspace." Promote someone else to `OWNER` first, then demote the original one.
- **The `OWNER` role itself can't be deleted, and its key can't be changed to something else.** You can still edit its name, description, or (carefully) its privilege set.

## What this means in practice

If you're building a custom "change this user's role" flow, handle the case where the target is the tenant's only owner — surface a clear message instead of letting the API call fail with a generic error:

```ts
import { getBridgeAuth } from '@nebulr-group/bridge-svelte';

try {
  await getBridgeAuth().team.updateUser({ id: userId, role: 'MEMBER' });
} catch (err) {
  // "There must be at least one owner for this workspace."
  if (err instanceof Error && err.message.includes('at least one owner')) {
    // Prompt to promote someone else to OWNER first
  }
}
```

`<TeamManagementPanel />` (see [User & Team management](/auth/ui/team-management/)) already handles this for you — the error surfaces as a normal form error in the drop-in UI, so you only need the snippet above if you're building your own role-management screen instead.

`OWNER` is granted the broadest default privilege set (`AUTHENTICATED`, `USER_READ`, `USER_WRITE`, `TENANT_READ`, `TENANT_WRITE`) — treat it as the role for whoever is ultimately accountable for the workspace, not a role you hand out casually.
