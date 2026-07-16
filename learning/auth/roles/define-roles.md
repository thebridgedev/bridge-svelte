# Define roles & privileges

A **privilege** is a scoped permission key with a description, for example `USER_WRITE`, "Can create and edit users." A **role** bundles privileges under a name and a unique key, and is what you actually assign to users: define a privilege once, then include its key in as many roles as need it. (See [How roles & privileges work](/auth/roles/how-it-works/) for the full concept.)

You define both in two places:

- **Control Center** (your admin dashboard at app.thebridge.dev): [Roles](https://app.thebridge.dev/roles) has separate **Roles** and **Privileges** tabs, with **Create Role** and **Create Privilege** buttons. This is the only way to create privileges today (see below).
- **CLI:** roles only. Create, update, delete, and list them, referencing privileges that already exist.
- **MCP (AI-assistant integration):** coming soon.

## Privileges

There's no CLI command for creating a privilege yet, only for referencing an existing one when you build a role (see below). If your role needs a privilege that doesn't exist, create it in Control Center first.

## Roles

**Create a role**, bundling privileges you've already defined:

```bash
bridge role create --name "Support" --key SUPPORT \
  --privileges USER_READ,TENANT_READ \
  --description "Read-only access for support staff"
```

**Change what a role grants** by passing the full new privilege list, not just what you're adding or removing. `--privileges` replaces the role's list wholesale rather than merging into it:

```bash
bridge role update --id <roleId> --privileges USER_READ,USER_WRITE,TENANT_READ
```

**List and remove roles:**

```bash
bridge role list

bridge role delete --id <roleId>
```

`--privileges` always takes a comma-separated list of privilege **keys** that already exist; the CLI never creates a new privilege on the fly.

**Next:** put your roles to work by assigning them, see [Assign roles to users](/auth/roles/assign-roles/).
