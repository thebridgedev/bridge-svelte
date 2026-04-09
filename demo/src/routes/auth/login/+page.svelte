<script lang="ts">
  import { goto } from '$app/navigation';
  import LoginForm from '@bridge-svelte/lib/client/components/sdk-auth/LoginForm.svelte';

  function handleLogin() {
    goto('/protected');
  }

  function handleError(err: Error) {
    console.error('[SDK Login]', err);
  }
</script>

<div class="page-container">
  <LoginForm
    class="my-login-form"
    showSignupLink
    signupHref="/auth/signup"
    showForgotPassword
    showMagicLink
    showPasskeys
    onLogin={handleLogin}
    onError={handleError}
  />
</div>

<style>
  .page-container {
    display: flex;
    justify-content: center;
    padding: 3rem 1rem;
  }

  /* Demonstrates consumer-controlled layout via class prop */
  .page-container :global(.my-login-form) {
    max-width: 380px;
    margin: 0 auto;
  }
</style>
