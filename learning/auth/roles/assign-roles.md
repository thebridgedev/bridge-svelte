# Assign roles to users

Roles are assigned per workspace (a workspace is called a *tenant* in the API, hence the `--tenant-id` flag below).

## Inviting a new user with a role

```bash
bridge user invite --email jane@example.com --role SUPPORT --tenant-id <tenantId>
```

`--tenant-id` can be omitted if you've set the `BRIDGE_TENANT_ID` environment variable. `--role` can be omitted too; the user gets whichever role is marked `isDefault` for your app.

## Changing an existing user's role

```bash
bridge user update --user-id <userId> --role ADMIN --tenant-id <tenantId>
```

## From your app

Team management already has a drop-in UI for this. See [User & Team management](/auth/ui/team-management/) in UI components, which lets workspace admins invite users and change roles without touching the CLI.
