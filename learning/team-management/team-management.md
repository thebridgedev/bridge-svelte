# Team Management

### TeamManagementPanel

A drop-in panel for managing team members, team profile, and workspace settings. Renders three tabs: **Users**, **Profile**, and **Workspace**.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `defaultTab` | `'users' \| 'profile' \| 'workspace'` | `'users'` | Which tab is active by default |
| `showProfileTab` | `boolean` | `true` | Show the profile tab |
| `showWorkspaceTab` | `boolean` | `true` | Show the workspace tab |
| `onError` | `(error: Error) => void` | — | Called on any error |
| `tabBar` | `Snippet<[{ tabs, activeTab, setTab }]>` | — | Custom tab bar render snippet |

**Usage:**

```svelte
<!-- src/routes/settings/team/+page.svelte -->
<script lang="ts">
  import { TeamManagementPanel } from '@nebulr-group/bridge-svelte';
</script>

<TeamManagementPanel
  defaultTab="users"
  onError={(err) => console.error(err)}
/>
```

**Custom tab bar:**

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

The panel includes:
- **Users tab** — list team members, invite new users, update roles, remove members.
- **Profile tab** — update team name and other profile fields.
- **Workspace tab** — update workspace settings.

### Individual tab components

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
