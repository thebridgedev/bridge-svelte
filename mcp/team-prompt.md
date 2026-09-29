# Bridge SvelteKit — Team Management

You are adding team management to a SvelteKit application that uses The Bridge.

## The one rule for app code

**Every gate in app code is a flag.** A link, a page, a button, an endpoint: if some people get it and others do not, the code asks a flag, and the flag's rule says why: a privilege (`privileges contains "USER_WRITE"`), a plan feature (`bridge:billing.entitlement.analytics eq true`) or a rollout. App code never reads a role, a privilege list, the plan or a plan feature to decide what someone may see or do.

Two things are not gates and are not flags: **numbers** are plan limits (`<QuotaGate>` in the browser, `@RequireQuota` on the backend), and **permission on one specific record** stays in app code ("only the author edits their post").

Before calling the work done, run `npx @nebulr-group/bridge-cli check gates` in the project. It lists every direct role, privilege, plan or plan-feature check with the flag to use instead. Fix each one.

In SvelteKit: a piece of UI is `<FeatureFlag key="…">`; a page is a route rule `{ match: '/admin/*', featureFlag: 'admin-area', redirectTo: '/' }`; a nav link is the same `<FeatureFlag>` around the link.

## Decide first — the whole panel, or one piece?

Read this table before writing anything. Both rows are drop-in components; there is no hook, service or form for you to build against.

| What you want on the page | Use | Where |
|---|---|---|
| **Everything** — users, profile and workspace settings together | `<TeamManagementPanel>`, which renders the three as tabs | one route, e.g. `/settings/team` |
| **One piece**, or your own layout around them | `<TeamUserList>`, `<TeamProfileForm>`, `<TeamWorkspaceForm>` | wherever you put them |

Same components either way — the panel *is* those three assembled. Start with `<TeamManagementPanel>` unless the user asked for a specific piece or their own layout; splitting it apart later is moving one import.

**Adding a user, changing a role and removing a user all live inside `<TeamUserList>`.** It ships its own add, edit and confirm-delete dialogs. Writing an invite form, a role dropdown or a delete confirmation is rebuilding something already on the page — and the hand-rolled version talks to the team API directly, so it misses the list's own refresh and error handling.

Only when the user wants their own team layout — an "Invite" button in a page header, say — place the dialogs themselves; they are exported too: `<TeamAddUserDialog open onclose onadded>`, `<TeamEditUserDialog open user roles onclose onupdated>`, `<TeamConfirmDialog open title message onconfirm oncancel>` and the row menu `<TeamUserActionsMenu onedit onresetpassword ondelete>`. Each calls the team API itself; you only hold `open` state and refresh your own list in `onadded` / `onupdated`.

## Prerequisites check

Before starting, verify that Bridge is set up in this project:
1. `@nebulr-group/bridge-svelte` is in package.json dependencies
2. `src/routes/+layout.ts` has `export const load = bridgeBootstrap({ rules, … })`
3. `src/routes/+layout.svelte` wraps the app in `<BridgeBootstrap>…</BridgeBootstrap>`
4. `VITE_BRIDGE_APP_ID` is set in `.env` (plus `VITE_BRIDGE_API_BASE_URL` for a stage or local app)

If any are missing, run `bridge guide svelte` first to complete the initial setup.

## Add the full team panel

Create a team settings page using `TeamManagementPanel`. This is a drop-in component that renders three tabs: **Users**, **Profile**, and **Workspace**.

Create `src/routes/settings/team/+page.svelte`:

```svelte
<script lang="ts">
  import { TeamManagementPanel } from '@nebulr-group/bridge-svelte';
</script>

<h1>Team Settings</h1>

<TeamManagementPanel
  defaultTab="users"
  onError={(err) => console.error(err)}
/>
```

**TeamManagementPanel props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `defaultTab` | `'users' \| 'profile' \| 'workspace'` | `'users'` | Which tab is active by default |
| `showProfileTab` | `boolean` | `true` | Show the profile tab |
| `showWorkspaceTab` | `boolean` | `true` | Show the workspace tab |
| `onError` | `(error: Error) => void` | -- | Called on any error |
| `seatsMetric` | `string` | -- | The plan limit that counts seats, e.g. `"seats"`. With it, Invite stops at the plan's limit and says why. See **Seat limits** below |
| `tabBar` | `Snippet<[{ tabs, activeTab, setTab }]>` | -- | Custom tab bar render snippet |

The panel includes:
- **Users tab** -- list team members, invite new users, update roles, remove members
- **Profile tab** -- update team name and other profile fields
- **Workspace tab** -- update workspace settings

**Custom tab bar (optional):**

```svelte
<TeamManagementPanel>
  {#snippet tabBar({ tabs, activeTab, setTab })}
    <nav class="custom-tabs">
      {#each tabs as tab}
        <button
          class:active={activeTab === tab.id}
          onclick={() => setTab(tab.id)}
        >
          {tab.label}
        </button>
      {/each}
    </nav>
  {/snippet}
</TeamManagementPanel>
```

**Hiding tabs:**

If the app only needs user management without profile or workspace settings:

```svelte
<TeamManagementPanel
  showProfileTab={false}
  showWorkspaceTab={false}
/>
```

## Using individual components

Each tab is also exported as a standalone component. Use these when you only need one piece of team management, or want to build your own layout:

```svelte
<script lang="ts">
  import { TeamUserList, TeamProfileForm, TeamWorkspaceForm } from '@nebulr-group/bridge-svelte';
</script>

<!-- Just the user list -->
<TeamUserList onError={(err) => console.error(err)} />

<!-- Just the profile form -->
<TeamProfileForm onError={(err) => console.error(err)} />

<!-- Just the workspace settings -->
<TeamWorkspaceForm onError={(err) => console.error(err)} />
```

All three accept `class`, `style`, and `onError` props.

**Example: user list on a dedicated members page:**

```svelte
<!-- src/routes/settings/members/+page.svelte -->
<script lang="ts">
  import { TeamUserList } from '@nebulr-group/bridge-svelte';
</script>

<h1>Team Members</h1>
<TeamUserList onError={(err) => console.error(err)} />
```

**Example: workspace settings on a separate page:**

```svelte
<!-- src/routes/settings/workspace/+page.svelte -->
<script lang="ts">
  import { TeamWorkspaceForm } from '@nebulr-group/bridge-svelte';
</script>

<h1>Workspace Settings</h1>
<TeamWorkspaceForm onError={(err) => console.error(err)} />
```

## Seat limits — when a plan sells seats

Seats are a plan limit the app names, `seats` here, like any other limit. It is a gauge that Bridge counts from workspace membership: the active members plus pending invites, read fresh however members are added or removed. There is no built-in `users` metric and no seat logic in Bridge. A seat count is a number, so it is a plan limit; never gate seats with a flag or an entitlement.

1. **Put the limit on each plan**, counted from membership:

```bash
bridge plan quota set <plan> --metric seats --limit N --policy hard --kind gauge --source membership
```

For "2 seats on Free, 5 on Pro": `bridge plan quota set free --metric seats --limit 2 --policy hard --kind gauge --source membership`, then the same for `pro` with `--limit 5`. (MCP: `set_plan_quota` with `metric: "seats"`, `policy: "hard"`, `kind: "gauge"`, `source: "membership"`.)

2. **Ask the user where invites start**: Bridge's built-in team page, or the app's own invite handler? Each answer is one line:
   - **Built-in team page**: `<TeamManagementPanel seatsMetric="seats" />` (or `<TeamUserList seatsMetric="seats" />`). Invite stops at the plan's limit and the line under it explains why, with the upgrade link. The count is re-read after every invite, removal, enable or disable.
   - **The app's own invite handler**: `@RequireQuota('seats')` on that backend handler. It checks the seat limit and writes nothing, because Bridge counts the members.

3. **Bridge's invite API does not refuse at the limit.** The check runs where the invite starts, which is why step 2 matters. Without `seatsMetric` the team page invites past the limit.

## Route setup — who sees the team page

Not everyone in a workspace should manage its members, so the team page and its nav link are gated. Like every gate in app code, that gate is a flag ruled on a privilege — never a role list in the code such as `['OWNER','ADMIN'].includes(role)`.

1. **Read the app's real roles first**: `list_roles` (MCP) or `bridge role list` (CLI). What a role can do is only "in the default setup"; pick the privilege the roles that should manage members actually hold (in the default setup, `USER_WRITE`).
2. **Create the flag** `team-management`, ruled on that privilege:

```bash
bridge flag create --key team-management --value-type boolean --state on-with-rule \
  --rule '{"branches":[{"conditions":[{"attribute":"privileges","operator":"contains","values":["USER_WRITE"]}],"returnValue":true}],"otherwiseValue":false,"rolloutPct":100}'
```

(MCP: `create_feature_flag` with the same rule as a structured object.) `contains` on `privileges` is exact membership.

3. **Gate the route** with a rule in the `bridgeBootstrap()` call in `src/routes/+layout.ts` — an edit to an existing rule for that path if there is one:

```ts
{ match: '/settings/team', featureFlag: 'team-management', redirectTo: '/' },
```

4. **Gate the nav link** with the same flag:

```svelte
<script lang="ts">
  import { FeatureFlag } from '@nebulr-group/bridge-svelte/flags';
</script>

<FeatureFlag key="team-management" defaultValue={false}>
  <a href="/settings/team">Team Settings</a>
</FeatureFlag>
```

Create the page file at `src/routes/settings/team/+page.svelte` as shown above; if `src/routes/settings/` does not exist, create it. The route stays protected by `defaultAccess: 'protected'`, so a signed-out visitor is sent to the login first.

## Verify

1. Signed in with a role that holds the privilege, navigate to `/settings/team` -- the team management panel renders and the nav link shows; with a role that does not, the link is hidden and the route redirects to `/`
2. Confirm the **Users** tab shows the current team members
3. Try inviting a user using the invite form in the Users tab. If the plans sell seats and the page has `seatsMetric="seats"`: on a plan with 2 seats and 2 members, Invite is disabled and says all seats are taken
4. Switch to the **Profile** tab and verify it renders the team profile form
5. Switch to the **Workspace** tab and verify it renders workspace settings
6. Test saving changes on the Profile and Workspace tabs
7. Run the project's build command to confirm no TypeScript or import errors
8. Run `npx @nebulr-group/bridge-cli check gates` -- it reports nothing
