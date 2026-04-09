<script lang="ts">
  import type { TeamProfile } from '@thebridge/auth-core';
  import type { HTMLAttributes } from 'svelte/elements';
  import { onMount } from 'svelte';
  import { getBridgeAuth } from '../../../core/bridge-instance.js';
  import Alert from '../sdk-auth/shared/Alert.svelte';
  import Spinner from '../sdk-auth/shared/Spinner.svelte';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    onError?: (error: Error) => void;
  }

  let {
    onError,
    class: className,
    style,
    ...rest
  }: Props = $props();

  let profile = $state<TeamProfile | null>(null);
  let firstName = $state('');
  let lastName = $state('');
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);

  onMount(() => {
    loadProfile();
  });

  async function loadProfile() {
    loading = true;
    error = null;
    try {
      const bridge = getBridgeAuth();
      profile = await bridge.team.getProfile();
      firstName = profile.firstName ?? '';
      lastName = profile.lastName ?? '';
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to load profile');
      error = e.message;
      onError?.(e);
    } finally {
      loading = false;
    }
  }

  async function handleSubmit() {
    saving = true;
    error = null;
    success = null;
    try {
      const bridge = getBridgeAuth();
      profile = await bridge.team.updateProfile({ firstName, lastName });
      success = 'Profile updated successfully.';
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to update profile');
      error = e.message;
      onError?.(e);
    } finally {
      saving = false;
    }
  }
</script>

<div class={className} {style} data-bridge-team-profile {...rest}>
  <h3 class="bridge-team-section-title">My Profile</h3>

  {#if loading}
    <div class="bridge-team-loading">
      <Spinner size={32} />
      <span>Loading profile...</span>
    </div>
  {:else}
    {#if error}
      <div class="bridge-team-alert"><Alert variant="error">{error}</Alert></div>
    {/if}
    {#if success}
      <div class="bridge-team-alert"><Alert variant="success">{success}</Alert></div>
    {/if}

    <form class="bridge-team-form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      <div class="bridge-team-form-group">
        <label for="bridge-profile-email">Email</label>
        <input id="bridge-profile-email" type="email" value={profile?.email ?? ''} disabled />
      </div>

      <div class="bridge-team-form-row">
        <div class="bridge-team-form-group">
          <label for="bridge-profile-first-name">First Name</label>
          <input
            id="bridge-profile-first-name"
            type="text"
            bind:value={firstName}
            disabled={saving}
          />
        </div>

        <div class="bridge-team-form-group">
          <label for="bridge-profile-last-name">Last Name</label>
          <input
            id="bridge-profile-last-name"
            type="text"
            bind:value={lastName}
            disabled={saving}
          />
        </div>
      </div>

      {#if profile?.role}
        <div class="bridge-team-form-group">
          <label>Role</label>
          <div class="bridge-team-readonly">{profile.role}</div>
        </div>
      {/if}

      <div class="bridge-team-form-actions">
        <button
          type="submit"
          class="bridge-btn bridge-btn-primary"
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  {/if}
</div>
