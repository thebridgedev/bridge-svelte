<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { profileStore } from '../../shared/profile.js';

  interface Props extends HTMLAttributes<HTMLSpanElement> {}

  let { class: className, style, ...rest }: Props = $props();

  const { profile } = profileStore;

  let displayName = $derived(
    $profile?.fullName || $profile?.email || ''
  );
</script>

{#if displayName}
  <span class={className} {style} data-bridge-profile-name {...rest}>{displayName}</span>
{/if}
