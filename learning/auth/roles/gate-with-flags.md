# Gate features by role or privilege

Role and privilege are both available as feature flag targeting attributes automatically, decoded from the JWT — no wiring, no context you have to pass by hand. For more on flags and rules in general, see [How flags work](/feature-flags/how-it-works/) and [Write targeting rules](/feature-flags/targeting/).

| Attribute | Value | Example |
|-----------|-------|---------|
| `user.role` | the role key | `"ENTERPRISE_BETA"` |
| `privileges` | array of privilege keys | `["USER_READ", "BETA_REPORTS"]` |

## Continuing the enterprise example

Following on from [Common role setups](/auth/roles/common-setups/) — a flag `beta_reports` with a rule targeting the role directly:

```
user.role eq "ENTERPRISE_BETA"
```

or targeting the privilege instead:

```
privileges contains "BETA_REPORTS"
```

Either way, the frontend code doesn't change:

```svelte
<script lang="ts">
  import { useFlag } from '@nebulr-group/bridge-svelte/flags';

  const betaReports = useFlag('beta_reports', false);
</script>

{#if betaReports.value}
  <BetaReportsPanel />
{/if}
```

Targeting the role is simpler when the role only ever means one thing. Targeting the privilege scales better if several different roles might eventually need the same access — grant them the privilege instead of duplicating the flag rule per role.
