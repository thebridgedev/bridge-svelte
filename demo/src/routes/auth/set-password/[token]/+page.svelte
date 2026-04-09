<script lang="ts">
  import { page } from '$app/stores';
  import ForgotPassword from '@bridge-svelte/lib/client/components/sdk-auth/ForgotPassword.svelte';

  let token = $derived($page.params.token);
</script>

<div class="page-container">
  <ForgotPassword {token} loginHref="/auth/login" />
</div>

<style>
  .page-container {
    display: flex;
    justify-content: center;
    padding: 3rem 1rem;
  }
</style>
