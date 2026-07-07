# Define roles & privileges

- **Control Center:** [Roles](https://app.thebridge.dev/roles) — has separate **Roles** and **Privileges** tabs, with **Create Role** and **Create Privilege** buttons.
- **CLI:** roles only, for now (see below) — privileges themselves are Control Center-only until the CLI catches up.
- **MCP:** not yet available — coming soon.

## Privileges

A privilege is just a key and a description — `USER_WRITE`, "Can create and edit users." Create these in Control Center first; you'll reference their keys when defining roles.

## Roles

```bash
bridge role create --name "Support" --key SUPPORT \
  --privileges USER_READ,TENANT_READ \
  --description "Read-only access for support staff"
```

```bash
bridge role update --id <roleId> --privileges USER_READ,USER_WRITE,TENANT_READ

bridge role delete --id <roleId>

bridge role list
```

`--privileges` takes a comma-separated list of existing privilege **keys** — create the privileges first (in Control Center), then bundle them into a role.
