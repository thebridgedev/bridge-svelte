<!-- The signed-in person's name, or their email while it has none. -->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { me, user } from '../../core/stores.js';

  let { class: className, style, ...rest }: HTMLAttributes<HTMLSpanElement> = $props();

  const name = $derived.by(() => {
    const profile = $me.value;
    const full = [profile?.firstName, profile?.lastName].filter((part) => part && part.trim() !== '').join(' ');
    return full !== '' ? full : (profile?.email ?? $user?.email ?? '');
  });
</script>

{#if name}
  <span class={className} {style} data-bridge-profile-name {...rest}>{name}</span>
{/if}
