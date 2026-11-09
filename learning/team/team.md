# The team panel

`<TeamPanel />` lets people see who is in their workspace, invite others, change roles, remove members, and edit the workspace and their own profile.

```svelte
<!-- src/routes/settings/team/+page.svelte -->
<script lang="ts">
  import { TeamPanel } from '@nebulr-group/bridge-svelte';
</script>

<TeamPanel />
```

Everyone sees the member list and their own profile. Inviting, changing roles, removing members and editing the workspace need the `bridge-team-manage` flag, whose rule in Bridge says who has it. Bridge checks every change again, so a person without the right is refused even if they reach the action another way, and the panel shows Bridge's reason.

## Tabs

| Tab | What it does |
|---|---|
| Members | The workspace's members, with search; edit a member's role or disable them; remove a member after showing what that removes |
| Invites | Pending invites; send one again (the old link stops working) or revoke it. An invite lasts 30 days |
| Workspace | The workspace's name and logo |
| Profile | The person's own name and phone number |

The roles offered when inviting or editing are the ones the person may give. Bridge emails the invite's link to your app's email-links address, where `/auth/invite` takes it (see [Sign-in pages](../sign-in/sign-in.md)). Without an email-links address in your app's settings, sending is refused with a message saying so, and nothing is sent. A workspace can send 50 invites an hour and 200 a day. There is no seat check in the browser: a workspace at its member limit gets Bridge's refusal, with an upgrade path if the plan allows more.

## The pieces

`MemberList`, `InviteDialog`, `InviteList`, `EditMemberDialog`, `ConfirmDialog`, `WorkspaceForm` and `ProfileForm` are the panel's parts, to place on your own pages. Each takes `class` and `style`, and the panel refreshes within a second when a member joins, changes or leaves (see [Live updates](../live-updates/live-updates.md)).

For your own screens, the client has the same calls:

```ts
import { getBridge } from '@nebulr-group/bridge-svelte';

const members = await getBridge().team.members.list({ search: 'ann' });
await getBridge().team.invites.create({ email: 'ann@example.com', role: 'MEMBER' });
```
