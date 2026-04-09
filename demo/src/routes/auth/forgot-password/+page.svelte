<script lang="ts">
  import ForgotPassword from '@bridge-svelte/lib/client/components/sdk-auth/ForgotPassword.svelte';
</script>

<div class="page-container">
  <ForgotPassword loginHref="/auth/login" />
</div>

<style>
  .page-container {
    display: flex;
    justify-content: center;
    padding: 3rem 1rem;
  }
</style>
