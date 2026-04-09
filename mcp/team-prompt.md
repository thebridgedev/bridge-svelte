# Bridge SvelteKit — Team Management

You are adding team management to a SvelteKit application that uses The Bridge.

## Prerequisites check

Before starting, verify that Bridge is set up in this project:
1. `@nebulr-group/bridge-svelte` is in package.json dependencies
2. `src/routes/+layout.ts` calls `bridgeBootstrap()` with a `BridgeConfig` and `RouteGuardConfig`
3. `src/routes/+layout.svelte` renders `<BridgeBootstrap>`
4. `VITE_BRIDGE_APP_ID` is set in `.env`

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

## Route setup

Add a settings/team route. This route is protected by default (assuming `defaultAccess: 'protected'` in the existing `RouteGuardConfig`), so no extra route config is needed.

Create the route file at `src/routes/settings/team/+page.svelte` as shown above. If the `src/routes/settings/` directory does not exist, create it.

If you want a navigation link to the team page, add it to your app's navigation:

```svelte
<a href="/settings/team">Team Settings</a>
```

## Verify

1. Navigate to `/settings/team` -- the team management panel should render
2. Confirm the **Users** tab shows the current team members
3. Try inviting a user using the invite form in the Users tab
4. Switch to the **Profile** tab and verify it renders the team profile form
5. Switch to the **Workspace** tab and verify it renders workspace settings
6. Test saving changes on the Profile and Workspace tabs
7. Run the project's build command to confirm no TypeScript or import errors
