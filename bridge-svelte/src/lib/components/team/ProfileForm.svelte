<!-- The signed-in person's own profile: name and phone number. -->
<script lang="ts">
  import type { Me } from '@nebulr-group/bridge-auth-core';
  import { untrack } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { getBridge } from '../../core/client.js';
  import { errorMessage, translator } from '../../core/i18n.js';
  import { me } from '../../core/stores.js';
  import Alert from '../shared/Alert.svelte';
  import Spinner from '../shared/Spinner.svelte';

  type Profile = Pick<Me, 'email' | 'firstName' | 'lastName' | 'phoneNumber'>;

  interface Props extends HTMLAttributes<HTMLDivElement> {
    onError?: (error: unknown) => void;
  }

  let { onError, class: className, style, ...rest }: Props = $props();

  const t = translator();

  let base = $state<Profile | null>(null);
  let firstName = $state('');
  let lastName = $state('');
  let phoneNumber = $state('');
  let saving = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);

  const changed = $derived.by(() => {
    const fields: { firstName?: string; lastName?: string; phoneNumber?: string } = {};
    if (base === null) return fields;
    if (firstName.trim() !== (base.firstName ?? '')) fields.firstName = firstName.trim();
    if (lastName.trim() !== (base.lastName ?? '')) fields.lastName = lastName.trim();
    if (phoneNumber.trim() !== (base.phoneNumber ?? '')) fields.phoneNumber = phoneNumber.trim();
    return fields;
  });
  const dirty = $derived(Object.keys(changed).length > 0);

  function adopt(value: Profile) {
    base = value;
    firstName = value.firstName ?? '';
    lastName = value.lastName ?? '';
    phoneNumber = value.phoneNumber ?? '';
  }

  // Fresh values from Bridge fill the form, unless the person is mid-edit.
  $effect(() => {
    const value = $me.value;
    if (value !== null) untrack(() => !dirty && adopt(value));
  });

  async function save() {
    if (!dirty) return;
    saving = true;
    error = null;
    success = null;
    try {
      adopt(await getBridge().me.update(changed));
      success = 'Profile updated successfully.';
      await me.refresh();
    } catch (err) {
      error = errorMessage(err, t);
      onError?.(err);
    } finally {
      saving = false;
    }
  }
</script>

<div class={className} {style} data-bridge-team-profile {...rest}>
  <h3 class="bridge-team-section-title">My Profile</h3>

  {#if base === null}
    {#if $me.error}
      <div class="bridge-team-alert"><Alert variant="error">{errorMessage($me.error, t)}</Alert></div>
    {:else}
      <div class="bridge-team-loading">
        <Spinner size={32} />
        <span>Loading profile...</span>
      </div>
    {/if}
  {:else}
    {#if error}
      <div class="bridge-team-alert"><Alert variant="error">{error}</Alert></div>
    {/if}
    {#if success}
      <div class="bridge-team-alert"><Alert variant="success">{success}</Alert></div>
    {/if}

    <form
      class="bridge-team-form"
      onsubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div class="bridge-team-form-group">
        <label for="bridge-profile-email">Email</label>
        <input id="bridge-profile-email" type="email" value={base.email} disabled />
      </div>

      <div class="bridge-team-form-row">
        <div class="bridge-team-form-group">
          <label for="bridge-profile-first-name">First Name</label>
          <input id="bridge-profile-first-name" type="text" autocomplete="given-name" bind:value={firstName} disabled={saving} />
        </div>

        <div class="bridge-team-form-group">
          <label for="bridge-profile-last-name">Last Name</label>
          <input id="bridge-profile-last-name" type="text" autocomplete="family-name" bind:value={lastName} disabled={saving} />
        </div>
      </div>

      <div class="bridge-team-form-group">
        <label for="bridge-profile-phone">Phone Number</label>
        <input id="bridge-profile-phone" type="tel" autocomplete="tel" bind:value={phoneNumber} disabled={saving} />
      </div>

      <div class="bridge-team-form-actions">
        <button type="submit" class="bridge-btn bridge-btn-primary" disabled={saving || !dirty}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  {/if}
</div>
