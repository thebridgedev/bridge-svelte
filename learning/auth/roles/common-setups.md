# Common role setups

A few patterns that cover most apps, built from privileges you define once and reuse across roles.

## Regular user, admin, and read-only

| Role | Key | Privileges | Use case |
|------|-----|------------|----------|
| Member | `MEMBER` | `AUTHENTICATED`, `USER_READ`, `TENANT_READ` | Everyday user — sees their own data and the workspace, can't manage other users or workspace settings |
| Admin | `ADMIN` | `AUTHENTICATED`, `USER_READ`, `USER_WRITE`, `TENANT_READ` | Can manage team members; workspace-level settings (billing, plan) stay with `OWNER` |
| Viewer | `VIEWER` | `AUTHENTICATED`, `USER_READ` | Read-only — can sign in and look around, can't create or edit anything |

`ADMIN` ships with exactly this privilege set by default. `MEMBER` and `VIEWER` are yours to add:

```bash
bridge role create --name Member --key MEMBER --privileges AUTHENTICATED,USER_READ,TENANT_READ

bridge role create --name Viewer --key VIEWER --privileges AUTHENTICATED,USER_READ
```

## A bespoke role for one client

Say an enterprise client is paying for early access to a reporting feature nobody else has. Create a privilege for it in Control Center — `BETA_REPORTS` — then a role that bundles it in with the rest of what that user needs:

```bash
bridge role create --name "Enterprise Beta" --key ENTERPRISE_BETA \
  --privileges AUTHENTICATED,USER_READ,TENANT_READ,BETA_REPORTS
```

Assign it to that client's users:

```bash
bridge user invite --email user@enterprise-client.com --role ENTERPRISE_BETA --tenant-id <theirTenantId>
```

The privilege alone doesn't turn the feature on in your UI — that's what feature flags are for. See [Gate features by role or privilege](/auth/roles/gate-with-flags/) to turn `BETA_REPORTS` into an actual flag rule.
