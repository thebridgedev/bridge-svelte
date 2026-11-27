# Bridge SvelteKit — Team (bridge-svelte 1.0)

You are adding **team management** to a SvelteKit app with `@nebulr-group/bridge-svelte` 1.0: people see who is in their workspace, invite others, change roles, remove members, and edit the workspace and their own profile. If Bridge is not set up in the project yet, do `bridge guide svelte` (MCP: `get_integration_guide topic=integration framework=svelte`) first.

## The one rule for app code

**Every gate in app code is a flag.** Who may manage the team is the standard flag `bridge-team-manage` (default rule: `bridge:privileges contains users:write`); who may see the team page is a flag too. App code never reads a role or a privilege list to decide what someone may see or do; `$workspace.role` is for showing only. Bridge checks every team change again on its side, so a person without the right is refused even if they reach the action another way, and the panel shows Bridge's reason.

Run `npx @nebulr-group/bridge-cli@alpha check gates` before calling the work done.

## Decide first: roles are the developer's

Which roles exist and what each may do are product decisions: ask the developer, then:

| | MCP | CLI 1.0 |
|---|---|---|
| See them | `list_roles`, `list_privileges` | `bridge role list`, `bridge privilege list` |
| A role | `create_role`, `update_role` | `bridge role create <key> --name <name> --privilege <p>` (repeat `--privilege`), `bridge role update <role> --privilege <p>` |
| The role new members get | `set_default_role` | `bridge role set-default <role>` |
| A privilege of the app's own | `create_privilege` | `bridge privilege create <key> --description "…"` |

Privileges are named `resource:action` (`users:write`, `billing:manage`, `reports:read`). Read the app's real roles before writing any rule: what a role can do is only the default setup.

## Add the whole panel

```svelte
<!-- src/routes/settings/team/+page.svelte -->
<script lang="ts">
  import { TeamPanel } from '@nebulr-group/bridge-svelte';
</script>

<TeamPanel />
```

| Tab | What it does |
|---|---|
| Members | The workspace's members, with search; change a member's role or disable them; remove a member after showing what that removes |
| Invites | Pending invites; send one again (the old link stops working) or revoke it. An invite lasts 30 days |
| Workspace | The workspace's name and logo |
| Profile | The person's own name and phone number |

Everyone sees the member list and their own profile; inviting, changing roles, removing members and editing the workspace need `bridge-team-manage`. Props: `defaultTab`, `showInvitesTab`, `showWorkspaceTab`, `showProfileTab` (each `true` by default), `onError`, a `tabBar` snippet, `class` and `style`.

The roles offered when inviting or editing are the ones the person may give. Bridge emails the invite's link to the app's email-links address, where `/auth/invite` (served by `<BridgeAuthRoutes>`) takes it; without an email-links address, sending is refused with a message saying so (`bridge app address add <origin>/auth --use email-links`). The panel refreshes within a second when a member joins, changes or leaves (Live updates).

**Seats.** A plan's `seats` limit (`bridge plan limit set <plan> seats=5`) is counted by Bridge from the workspace's members, and Bridge refuses an invite over it with an upgrade path. There is no seat check to write in the browser.

## The team page in the navigation and the routes

The page and its link follow a flag the developer agrees on: the standard `bridge-team-manage` for "only people who manage the team", or a flag of their own.

```ts
// src/routes/+layout.ts
export const load = bridgeBootstrap({
  rules: [
    { match: '/', public: true },
    { match: '/settings/team', featureFlag: 'bridge-team-manage', redirectTo: '/' },
  ],
});
```

```svelte
<FeatureFlag key="bridge-team-manage"><a href="/settings/team">Team</a></FeatureFlag>
```

When everyone in the workspace should see the member list, leave the route without `featureFlag`: the panel itself hides what a person may not do.

## Using one piece

`MemberList`, `InviteList`, `InviteDialog`, `EditMemberDialog`, `ConfirmDialog`, `WorkspaceForm` and `ProfileForm` are the panel's parts, to place on your own pages; each takes `class` and `style`. For your own screens, the client has the same calls:

```ts
import { getBridge } from '@nebulr-group/bridge-svelte';

const members = await getBridge().team.members.list({ search: 'ann' });
await getBridge().team.invites.create({ email: 'ann@example.com', role: 'MEMBER' });
```

`$workspaces` lists the person's workspaces, `$me` their profile; switching workspace is `/auth/workspaces`. From a terminal: `bridge member list`, `bridge invite send <email> --role <role>`, `bridge invite list`.

## Checklist

- [ ] Roles and privileges are the developer's answers (`bridge role list`)
- [ ] A page renders `<TeamPanel />` (or its parts)
- [ ] The page and its link follow a flag, never a role check
- [ ] The app has an email-links address, so invites reach `/auth/invite`

## Verify

Run the terminal checks. If you have a browser tool, run the browser checks too. If you do not, list them for the developer, numbered, and start the summary with a Heads up line saying which checks were not run.

### Terminal checks

1. The build passes; `npx @nebulr-group/bridge-cli@alpha check gates` lists nothing.
2. `bridge role list` shows the roles the developer chose; `bridge flag get bridge-team-manage` shows its rule.
3. `bridge app address list` shows an `email-links` address.

### Browser checks

1. As an owner, the team page lists the members; inviting an address sends an email whose link lands on `/auth/invite` and joins the workspace with that role.
2. As a member without `users:write`, the Team link is hidden and the panel offers no invite or role change.
3. Removing a member shows what that removes, and they lose access within seconds.

When a check was not run, the summary starts with "Heads up: not verified in a browser" and lists it for the developer.
