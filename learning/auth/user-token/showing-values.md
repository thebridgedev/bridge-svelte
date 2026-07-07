# Showing values from the token

## Getting user profile

Access the current user's profile with `profileStore`:

```svelte
<script lang="ts">
  import { profileStore } from '@nebulr-group/bridge-svelte';

  const { profile } = profileStore;
</script>

{#if $profile}
  <h2>{$profile.fullName}</h2>
  <p>{$profile.email}</p>

  {#if $profile.tenant}
    <p>Tenant: {$profile.tenant.name}</p>
  {/if}
{:else if $profile === undefined}
  <p>Loading profile...</p>
{:else}
  <p>Not logged in</p>
{/if}
```

`profileStore` is `undefined` while loading, `null` when not authenticated, and a profile object when authenticated.

A live snapshot of the signed-in user (`id`, `email`, `role`, `tenantId`) plus workspace and subscription state is also available on the unified bridge surface (`bridge.user`, `bridge.tenant.*`), kept current over the live channel — see [Live Updates & the Bridge Surface](../live-updates/live-updates.md).

## ProfileName component

A drop-in component that renders the user's display name. No configuration needed:

```svelte
<script lang="ts">
  import { ProfileName } from '@nebulr-group/bridge-svelte';
</script>

<ProfileName />
<!-- renders: "John Doe" or "john@example.com" or nothing when not authenticated -->
```

Outputs a `<span>` with a `data-bridge-profile-name` attribute for styling. Accepts `class` and `style` props.
