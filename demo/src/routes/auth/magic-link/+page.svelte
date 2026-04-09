<script lang="ts">
  import MagicLink from '@bridge-svelte/lib/client/components/sdk-auth/MagicLink.svelte';
</script>

<div class="page-container">
  <MagicLink loginHref="/auth/login" />
</div>

<style>
  .page-container {
    display: flex;
    justify-content: center;
    padding: 3rem 1rem;
  }
</style>
