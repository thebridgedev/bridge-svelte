<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import PasskeySetup from '@bridge-svelte/lib/client/components/sdk-auth/PasskeySetup.svelte';

  let token = $derived($page.params.token);
</script>

<div class="page-container">
  <PasskeySetup
    {token}
    onComplete={() => goto('/protected')}
    onBack={() => goto('/auth/login')}
    onExpired={() => goto('/auth/login')}
  />
</div>

<style>
  .page-container {
    display: flex;
    justify-content: center;
    padding: 3rem 1rem;
  }
</style>
