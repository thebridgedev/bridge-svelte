# Gate features by role or privilege

Role and privilege are both available as feature flag targeting attributes automatically, decoded from the JWT: no wiring, no context you have to pass by hand. For more on flags and rules in general, see [How flags work](/feature-flags/how-it-works/) and [Write targeting rules](/feature-flags/targeting/by-plan-or-role/).

| Attribute | Value | Example |
|-----------|-------|---------|
| `user.role` | the role key | `"ENTERPRISE_BETA"` |
| `privileges` | array of privilege keys | `["USER_READ", "BETA_REPORTS"]` |

## Continuing the enterprise example

Following on from [Common role setups](/auth/roles/common-setups/), a flag `beta_reports` with a rule targeting the privilege (preferred):

```
privileges contains "BETA_REPORTS"
```

or targeting the role directly:

```
user.role eq "ENTERPRISE_BETA"
```

`contains` on `privileges` matches a whole key: `BETA_REPORTS` does not match `BETA_REPORTS_ALL`.

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

Prefer the privilege: the rule keeps working when roles are renamed or reshuffled, and several roles can get the same access by granting them the privilege instead of duplicating the flag rule per role. Target the role key only when the role itself is the point.
