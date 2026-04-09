<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  interface Props extends HTMLAttributes<HTMLDivElement> {
    onedit?: () => void;
    onresetpassword?: () => void;
    ondelete?: () => void;
  }

  let {
    onedit,
    onresetpassword,
    ondelete,
    class: className,
    style,
    ...rest
  }: Props = $props();

  let isOpen = $state(false);
  let menuEl: HTMLDivElement | undefined = $state();

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    isOpen = !isOpen;
  }

  function handleAction(fn?: () => void) {
    isOpen = false;
    fn?.();
  }

  function handleClickOutside(e: MouseEvent) {
    if (isOpen && menuEl && !menuEl.contains(e.target as Node)) {
      isOpen = false;
    }
  }
</script>

<svelte:document onclick={handleClickOutside} />

<div class={className} {style} data-bridge-team-actions bind:this={menuEl} {...rest}>
  <button class="bridge-team-actions-trigger" onclick={toggle} aria-label="Actions">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="3" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="8" cy="13" r="1.5" />
    </svg>
  </button>

  {#if isOpen}
    <div class="bridge-team-actions-menu">
      <button class="bridge-team-actions-item" onclick={() => handleAction(onedit)}>
        Edit
      </button>
      <button class="bridge-team-actions-item" onclick={() => handleAction(onresetpassword)}>
        Reset Password
      </button>
      <button class="bridge-team-actions-item bridge-team-actions-item--danger" onclick={() => handleAction(ondelete)}>
        Delete
      </button>
    </div>
  {/if}
</div>
