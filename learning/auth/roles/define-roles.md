# Define roles & privileges

- **Control Center:** [Roles](https://app.thebridge.dev/roles) — has separate **Roles** and **Privileges** tabs, with **Create Role** and **Create Privilege** buttons. This is the only way to create privileges today (see below).
- **CLI:** roles only — create, update, delete, and list them, referencing privileges that already exist.
- **MCP:** not yet available — coming soon.

## Privileges

A privilege is just a key and a description — for example `USER_WRITE`, "Can create and edit users." Privileges are the building blocks roles are made of: define one once, then bundle its key into as many roles as need it.

There's no CLI command for creating a privilege yet — only for referencing an existing one when you build a role (see below). If your role needs a privilege that doesn't exist, create it in Control Center first.

## Roles

A role bundles a name, a unique key, a description, and a list of privilege keys.

**Create a role**, bundling privileges you've already defined:

```bash
bridge role create --name "Support" --key SUPPORT \
  --privileges USER_READ,TENANT_READ \
  --description "Read-only access for support staff"
```

**Change what a role grants** — pass the full new privilege list, not just what you're adding or removing. `--privileges` replaces the role's list wholesale rather than merging into it:

```bash
bridge role update --id <roleId> --privileges USER_READ,USER_WRITE,TENANT_READ
```

**List and remove roles:**

```bash
bridge role list

bridge role delete --id <roleId>
```

`--privileges` always takes a comma-separated list of privilege **keys** that already exist — the CLI never creates a new privilege on the fly.
